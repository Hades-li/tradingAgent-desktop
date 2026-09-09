"""The shared session must translate graph chunks into the documented events.

These cover the invariants the desktop client and the CLI both depend on:
message de-duplication under ``stream_mode="values"``, full-replacement report
sections, status transitions and checkpoint teardown.
"""

import unittest

from tradingagents.session import (
    PROTOCOL_VERSION,
    AnalysisSession,
    RunEvent,
    normalize_analysts,
)


class FakeMessage:
    def __init__(self, content, msg_id=None, tool_calls=None):
        self.content = content
        self.id = msg_id
        self.tool_calls = tool_calls or []


class FakePropagator:
    def create_initial_state(self, *args, **kwargs):
        return {"messages": []}

    def get_graph_args(self, callbacks=None):
        return {"stream_mode": "values", "config": {"recursion_limit": 100}}


class FakeInnerGraph:
    def __init__(self, chunks):
        self.chunks = chunks
        self.stream_calls = []

    def stream(self, graph_input, **kwargs):
        self.stream_calls.append((graph_input, kwargs))
        yield from self.chunks


class FakeGraph:
    """Minimal stand-in for TradingAgentsGraph's streaming surface."""

    def __init__(self, chunks, thread_id=None):
        self.graph = FakeInnerGraph(chunks)
        self.propagator = FakePropagator()
        self.thread_id = thread_id
        self.ended = 0
        self.cleared = 0

    def resolve_instrument_context(self, ticker, asset_type="stock"):
        return f"{ticker}/{asset_type}"

    def begin_checkpoint(self, *args, **kwargs):
        return self.thread_id

    def checkpoint_input(self, init_state):
        return init_state

    def clear_checkpoint_on_success(self, *args, **kwargs):
        self.cleared += 1

    def end_checkpoint(self):
        self.ended += 1

    def process_signal(self, decision):
        return "Buy"


def build_session(chunks, analysts=("market",), **kwargs):
    return AnalysisSession(
        "NVDA",
        "2026-01-02",
        list(analysts),
        config={},
        graph=FakeGraph(chunks, **kwargs),
        run_id="run-1",
    )


class TestNormalizeAnalysts(unittest.TestCase):
    def test_reorders_and_lowercases(self):
        self.assertEqual(
            normalize_analysts({"NEWS", "market"}),
            ["market", "news"],
        )

    def test_rejects_unknown_key(self):
        with self.assertRaises(ValueError):
            normalize_analysts(["market", "astrology"])


class TestRunEvent(unittest.TestCase):
    def test_json_object_is_flat_and_versioned(self):
        event = RunEvent("agent_status", {"agent": "Trader", "status": "completed"})
        self.assertEqual(
            event.to_json_obj(),
            {
                "v": PROTOCOL_VERSION,
                "type": "agent_status",
                "agent": "Trader",
                "status": "completed",
            },
        )


class TestSessionEvents(unittest.TestCase):
    def test_run_starts_and_finishes(self):
        session = build_session([{"messages": [], "final_trade_decision": "**Rating**: Buy"}])
        events = list(session.run())

        self.assertEqual(events[0].type, "run_started")
        self.assertEqual(events[0].data["ticker"], "NVDA")
        self.assertEqual(events[0].data["analysts"], ["market"])
        self.assertEqual(events[1].type, "agent_status")
        self.assertEqual(events[1].data, {"agent": "Market Analyst", "status": "in_progress"})

        finished = events[-1]
        self.assertEqual(finished.type, "run_finished")
        self.assertEqual(finished.data["signal"], "Buy")
        self.assertFalse(finished.data["isReview"])

    def test_messages_are_deduplicated_across_chunks(self):
        # stream_mode="values" re-sends the whole accumulated message list.
        msg = FakeMessage("hello", msg_id="m1")
        second = FakeMessage("world", msg_id="m2")
        session = build_session([{"messages": [msg]}, {"messages": [msg, second]}])

        texts = [e.data["content"] for e in session.run() if e.type == "message"]
        self.assertEqual(texts.count("hello"), 1)
        self.assertEqual(texts.count("world"), 1)

    def test_tool_calls_emitted_for_dict_and_object_forms(self):
        class ObjToolCall:
            name = "get_news"
            args = {"ticker": "NVDA"}

        session = build_session(
            [
                {
                    "messages": [
                        FakeMessage(
                            "",
                            msg_id="m1",
                            tool_calls=[{"name": "get_prices", "args": {"days": 5}}],
                        ),
                        FakeMessage("", msg_id="m2", tool_calls=[ObjToolCall()]),
                    ]
                }
            ]
        )
        calls = [(e.data["name"], e.data["args"]) for e in session.run() if e.type == "tool_call"]
        self.assertEqual(
            calls, [("get_prices", {"days": 5}), ("get_news", {"ticker": "NVDA"})]
        )

    def test_analyst_report_completes_analyst_and_starts_research(self):
        session = build_session([{"messages": [], "market_report": "# MKT"}])
        events = list(session.run())

        sections = [e for e in events if e.type == "report_section"]
        self.assertEqual(sections[0].data["section"], "market_report")
        self.assertEqual(sections[0].data["content"], "# MKT")

        statuses = [(e.data["agent"], e.data["status"]) for e in events if e.type == "agent_status"]
        self.assertIn(("Market Analyst", "completed"), statuses)
        self.assertIn(("Bull Researcher", "in_progress"), statuses)

    def test_unselected_analyst_never_emits_status(self):
        session = build_session([{"messages": [], "news_report": "# NEWS"}])
        agents = {e.data["agent"] for e in session.run() if e.type == "agent_status"}
        self.assertNotIn("News Analyst", agents)
        self.assertNotIn("news_report", session.report_sections)

    def test_research_judge_hands_off_to_trader(self):
        session = build_session(
            [
                {
                    "messages": [],
                    "investment_debate_state": {
                        "bull_history": "bull",
                        "bear_history": "bear",
                        "judge_decision": "go long",
                    },
                }
            ]
        )
        events = list(session.run())
        statuses = [(e.data["agent"], e.data["status"]) for e in events if e.type == "agent_status"]
        self.assertIn(("Research Manager", "completed"), statuses)
        self.assertIn(("Trader", "in_progress"), statuses)

        # investment_plan is replaced, not appended: the judge decision wins.
        self.assertEqual(
            session.report_sections["investment_plan"],
            "### Research Manager Decision\ngo long",
        )

    def test_final_state_merges_chunks_and_all_agents_complete(self):
        session = build_session(
            [
                {"messages": [], "market_report": "# MKT"},
                {"messages": [], "trader_investment_plan": "buy"},
            ]
        )
        list(session.run())
        self.assertEqual(session.final_state["market_report"], "# MKT")
        self.assertEqual(session.final_state["trader_investment_plan"], "buy")
        self.assertTrue(all(s == "completed" for s in session.agent_status.values()))

    def test_checkpoint_thread_id_injected_and_torn_down(self):
        session = build_session([{"messages": []}], thread_id="tid-42")
        list(session.run())
        _, kwargs = session.graph.graph.stream_calls[0]
        self.assertEqual(kwargs["config"]["configurable"]["thread_id"], "tid-42")
        self.assertEqual(session.graph.ended, 1)
        self.assertEqual(session.graph.cleared, 1)

    def test_checkpoint_torn_down_when_stream_raises(self):
        def exploding():
            yield {"messages": []}
            raise RuntimeError("boom")

        session = build_session(exploding())
        with self.assertRaises(RuntimeError):
            list(session.run())
        self.assertEqual(session.graph.ended, 1)
        # A failed run keeps its checkpoint so it can resume.
        self.assertEqual(session.graph.cleared, 0)

    def test_unparseable_decision_flags_review(self):
        class ReviewGraph(FakeGraph):
            def process_signal(self, decision):
                return "REVIEW"

        session = AnalysisSession(
            "NVDA",
            "2026-01-02",
            ["market"],
            config={},
            graph=ReviewGraph([{"messages": [], "final_trade_decision": "???"}]),
        )
        finished = list(session.run())[-1]
        self.assertEqual(finished.data["signal"], "REVIEW")
        self.assertTrue(finished.data["isReview"])

    def test_completed_reports_count_requires_finalizing_agent(self):
        session = build_session([{"messages": []}])
        session.report_sections["market_report"] = "# MKT"
        self.assertEqual(session.completed_reports_count(), 0)
        session.agent_status["Market Analyst"] = "completed"
        self.assertEqual(session.completed_reports_count(), 1)


if __name__ == "__main__":
    unittest.main()
