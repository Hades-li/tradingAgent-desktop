"""The desktop sidecar must speak clean JSON Lines on stdout.

Covers request parsing, the stdout-protection rule (stray ``print()`` must not
corrupt the stream), the run lifecycle and cancellation handling.
"""

import io
import json
import sys
import unittest
from unittest import mock

from tradingagents import ipc_main


class FakePropagator:
    def get_graph_args(self, callbacks=None):
        return {"config": {"recursion_limit": 100}}


class FakeGraph:
    """Stands in for TradingAgentsGraph; also prints, like the data layer does."""

    chunks = [{"messages": [], "market_report": "# MKT", "final_trade_decision": "Rating: Buy"}]

    def __init__(self, *args, **kwargs):
        self.propagator = FakePropagator()

    def create_run_state(self, ticker, trade_date, asset_type="stock", portfolio=None):
        print("noisy data-layer progress line")
        return {"messages": []}

    def begin_checkpoint(self, *args, **kwargs):
        return None

    def checkpoint_input(self, init_state):
        return init_state

    def stream_run(self, graph_input, **kwargs):
        for chunk in self.chunks:
            yield chunk.get("messages", []), chunk

    def record_decision(self, *args, **kwargs):
        pass

    def clear_checkpoint_on_success(self, *args, **kwargs):
        pass

    def end_checkpoint(self):
        pass

    def save_reports(self, final_state, ticker, save_path=None, html=True):
        from tradingagents.reporting import write_report_tree

        return write_report_tree(final_state, ticker, save_path, html=html)


class CaptureProtocol:
    """Capture protocol stdout the way the Electron reader would see it."""

    def __enter__(self):
        self.buffer = io.StringIO()
        self._patch = mock.patch.object(ipc_main, "_PROTOCOL_STDOUT", self.buffer)
        self._patch.start()
        return self

    def __exit__(self, *exc):
        self._patch.stop()
        return False

    @property
    def events(self):
        return [json.loads(line) for line in self.buffer.getvalue().splitlines() if line]


class TestReadRequest(unittest.TestCase):
    def test_reads_from_argv(self):
        request = ipc_main.read_request(["prog", '{"ticker": "NVDA"}'])
        self.assertEqual(request["ticker"], "NVDA")

    def test_reads_one_line_from_stdin_when_dashed(self):
        with mock.patch.object(sys, "stdin", io.StringIO('{"ticker": "SPY"}\n')):
            request = ipc_main.read_request(["prog", "-"])
        self.assertEqual(request["ticker"], "SPY")

    def test_rejects_unknown_protocol_version(self):
        with self.assertRaises(ValueError):
            ipc_main.read_request(["prog", '{"v": 99}'])

    def test_rejects_non_object_payload(self):
        with self.assertRaises(ValueError):
            ipc_main.read_request(["prog", "[1, 2]"])

    def test_rejects_empty_payload(self):
        with self.assertRaises(ValueError):
            ipc_main.read_request(["prog", "   "])


class TestEmit(unittest.TestCase):
    def test_one_compact_line_per_event(self):
        with CaptureProtocol() as captured:
            ipc_main.emit({"v": 1, "type": "message", "content": "多行\ntext"})
            ipc_main.emit({"v": 1, "type": "run_finished"})
        self.assertEqual(len(captured.buffer.getvalue().splitlines()), 2)
        self.assertEqual(captured.events[0]["content"], "多行\ntext")

    def test_error_event_shape(self):
        with CaptureProtocol() as captured:
            ipc_main.emit_error("boom", recoverable=True, code="cancelled")
        self.assertEqual(
            captured.events[0],
            {
                "v": 1,
                "type": "error",
                "message": "boom",
                "recoverable": True,
                "code": "cancelled",
            },
        )


class TestRunCommand(unittest.TestCase):
    def run_sidecar(self, request):
        with CaptureProtocol() as captured, mock.patch(
            "tradingagents.session.TradingAgentsGraph", FakeGraph
        ):
            code = ipc_main.run_command(request)
        return code, captured.events

    def test_emits_lifecycle_events(self):
        code, events = self.run_sidecar(
            {"ticker": "NVDA", "date": "2026-01-02", "analysts": ["market"]}
        )
        self.assertEqual(code, 0)
        self.assertEqual(events[0]["type"], "run_started")
        self.assertEqual(events[-1]["type"], "run_finished")
        self.assertEqual(events[-1]["signal"], "Buy")
        self.assertFalse(events[-1]["isReview"])
        self.assertTrue(all(event["v"] == 1 for event in events))

        sections = [e for e in events if e["type"] == "report_section"]
        self.assertEqual(sections[0]["section"], "market_report")

    def test_stray_prints_never_reach_the_protocol_stream(self):
        # FakeGraph.create_run_state prints, mimicking the Yahoo vendor modules.
        real_stdout = sys.stdout
        noise = io.StringIO()
        try:
            sys.stdout = noise
            ipc_main._protect_stdout()
            _, events = self.run_sidecar(
                {"ticker": "NVDA", "date": "2026-01-02", "analysts": ["market"]}
            )
        finally:
            sys.stdout = real_stdout
        # Not one byte of the print() landed on the protocol handle.
        self.assertEqual(noise.getvalue(), "")
        self.assertTrue(events)

    def test_asset_type_is_detected_when_absent(self):
        _, events = self.run_sidecar({"ticker": "BTC-USD", "date": "2026-01-02"})
        self.assertEqual(events[0]["assetType"], "crypto")

    def test_missing_ticker_is_rejected(self):
        with self.assertRaises(ValueError):
            self.run_sidecar({"date": "2026-01-02"})

    def test_save_path_writes_report_tree_and_reports_it(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "NVDA_20260102"
            _, events = self.run_sidecar(
                {"ticker": "NVDA", "date": "2026-01-02", "savePath": str(target)}
            )
            self.assertTrue((target / "complete_report.md").exists())
            self.assertEqual(events[-1]["reportPath"], str(target / "complete_report.md"))


class TestCancellationSignal(unittest.TestCase):
    def test_cancellation_bypasses_broad_exception_handlers(self):
        # LangGraph and the LLM SDKs wrap node execution in `except Exception`.
        # An Exception subclass here is silently swallowed and the run keeps
        # going after the user pressed stop, so this must stay a BaseException.
        self.assertTrue(issubclass(ipc_main._Cancelled, BaseException))
        self.assertFalse(issubclass(ipc_main._Cancelled, Exception))


class TestMain(unittest.TestCase):
    """``main`` claims the real stdout as its private protocol handle."""

    def call_main(self, argv):
        import signal

        buffer = io.StringIO()
        real_stdout = sys.stdout
        handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}
        try:
            sys.stdout = buffer
            code = ipc_main.main(argv)
        finally:
            sys.stdout = real_stdout
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
        events = [json.loads(line) for line in buffer.getvalue().splitlines() if line]
        return code, events

    def test_invalid_request_emits_error_and_exits_nonzero(self):
        code, events = self.call_main(["prog", "not json"])
        self.assertEqual(code, 1)
        self.assertEqual(events[0]["type"], "error")
        self.assertFalse(events[0]["recoverable"])

    def test_options_command_lists_providers(self):
        code, events = self.call_main(["prog", '{"command": "options"}'])
        self.assertEqual(code, 0)
        payload = events[0]
        self.assertEqual(payload["type"], "options")
        self.assertTrue(any(p["id"] == "openai" for p in payload["providers"]))
        self.assertEqual(
            [a["key"] for a in payload["analysts"]],
            ["market", "social", "news", "fundamentals"],
        )

    def test_cancellation_is_reported_as_recoverable_and_exits_zero(self):
        def explode(_request):
            raise ipc_main._Cancelled

        # os._exit would take the test runner down with it; assert it is called
        # with a success code instead.
        with mock.patch.object(ipc_main, "run_command", explode), mock.patch(
            "os._exit"
        ) as hard_exit:
            _, events = self.call_main(["prog", '{"ticker": "NVDA", "date": "2026-01-02"}'])
        hard_exit.assert_called_once_with(0)
        self.assertEqual(events[0]["code"], "cancelled")
        self.assertTrue(events[0]["recoverable"])

    def test_run_failure_emits_error_and_exits_nonzero(self):
        def explode(_request):
            raise RuntimeError("provider exploded")

        with mock.patch.object(ipc_main, "run_command", explode):
            code, events = self.call_main(
                ["prog", '{"ticker": "NVDA", "date": "2026-01-02"}']
            )
        self.assertEqual(code, 1)
        self.assertIn("provider exploded", events[0]["message"])

    def test_full_run_over_the_real_entry_point(self):
        with mock.patch("tradingagents.session.TradingAgentsGraph", FakeGraph):
            code, events = self.call_main(
                ["prog", '{"ticker": "NVDA", "date": "2026-01-02", "analysts": ["market"]}']
            )
        self.assertEqual(code, 0)
        self.assertEqual(events[0]["type"], "run_started")
        self.assertEqual(events[-1]["type"], "run_finished")


if __name__ == "__main__":
    unittest.main()
