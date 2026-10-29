"""stdio JSON-Lines entry point for the desktop client.

One process per analysis run. The desktop main process spawns::

    python -m tradingagents.ipc_main '{"ticker": "NVDA", ...}'

and reads one compact JSON object per line from stdout. The wire contract is
documented in ``tradingagents/PROTOCOL.md``; the event stream itself comes from
:class:`tradingagents.session.AnalysisSession`, which the CLI also uses.

Everything in here is deliberately import-light and side-effect free until
:func:`main` runs, so ``import tradingagents.ipc_main`` stays safe in tests and
in the CI smoke check.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import traceback
from typing import Any

_PROTOCOL_STDOUT = sys.stdout


class _Cancelled(BaseException):
    """Raised from the SIGTERM/SIGINT handler to unwind the run cleanly.

    Derives from ``BaseException``, like ``KeyboardInterrupt``: LangGraph and
    the LLM SDKs wrap node execution in broad ``except Exception`` handlers, so
    an ``Exception`` subclass gets swallowed and the run simply carries on —
    the user presses 停止 and keeps paying for tokens.
    """


# How long a cancelled run may take to unwind before the process exits anyway.
# The analysts run on worker threads, and LangGraph's own cleanup waits for every
# call still in flight, which can be a minute for a slow model; the desktop client
# gives up and sends SIGKILL after five seconds, well before that.
CANCEL_GRACE_SECONDS = 2.0

_cancel_lock = threading.Lock()
_cancel_reported = False


def _finish_cancelled() -> None:
    """Report the cancellation once, then leave the process for good.

    Reached from the main thread when the run has unwound, or from the grace
    timer when it has not; whichever comes first wins.
    """
    global _cancel_reported
    with _cancel_lock:
        if _cancel_reported:
            return
        _cancel_reported = True
        emit_error("run cancelled", recoverable=True, code="cancelled")
        sys.stderr.flush()
        # LangGraph leaves non-daemon worker threads behind, and a normal
        # return would block in threading._shutdown until the in-flight LLM
        # call completes — well past the caller's SIGKILL deadline.
        os._exit(0)


def _protect_stdout() -> None:
    """Give the protocol a private stdout handle and send stray prints to stderr.

    Several data-layer modules ``print()`` progress directly (e.g.
    the Yahoo vendor modules). Rebinding ``sys.stdout`` once here keeps those
    lines out of the JSON stream without touching call sites, and covers any
    ``print()`` added later.
    """
    global _PROTOCOL_STDOUT
    _PROTOCOL_STDOUT = sys.stdout
    sys.stdout = sys.stderr


def emit(obj: dict[str, Any]) -> None:
    """Write one JSON line to the protocol stream and flush immediately."""
    _PROTOCOL_STDOUT.write(json.dumps(obj, ensure_ascii=False, default=str) + "\n")
    _PROTOCOL_STDOUT.flush()


def emit_error(message: str, recoverable: bool = False, code: str = "failed") -> None:
    emit(
        {
            "v": 1,
            "type": "error",
            "message": message,
            "recoverable": recoverable,
            "code": code,
        }
    )


def read_request(argv: list[str]) -> dict[str, Any]:
    """Parse the request from argv, or from a single stdin line when absent."""
    raw = argv[1] if len(argv) > 1 and argv[1] != "-" else sys.stdin.readline()
    if not raw or not raw.strip():
        raise ValueError("no request payload provided (argv[1] or one stdin line)")
    request = json.loads(raw)
    if not isinstance(request, dict):
        raise ValueError("request must be a JSON object")
    version = request.get("v", 1)
    if version != 1:
        raise ValueError(f"unsupported request protocol version: {version!r}")
    return request


def build_config(overrides: dict | None) -> dict:
    """DEFAULT_CONFIG (already env-applied) plus explicit per-run overrides."""
    from tradingagents.default_config import DEFAULT_CONFIG

    config = DEFAULT_CONFIG.copy()
    if overrides:
        config.update(overrides)
    return config


def options_payload() -> dict[str, Any]:
    """Describe providers, models, analysts and vendors for the settings UI.

    Emitting this from Python keeps the desktop settings screen from carrying a
    second, drifting copy of the catalog.
    """
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.llm_clients.api_key_env import PROVIDER_API_KEY_ENV
    from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS
    from tradingagents.session import ANALYST_MAPPING, TEAM_LAYOUT

    providers = []
    for provider, mode_options in sorted(MODEL_OPTIONS.items()):
        providers.append(
            {
                "id": provider,
                "apiKeyEnv": PROVIDER_API_KEY_ENV.get(provider),
                # Only local / generic endpoints take a user-supplied base URL;
                # for hosted providers the client picks its own.
                "supportsCustomEndpoint": provider in ("ollama", "openai_compatible"),
                "quickModels": [
                    {"label": label, "value": value}
                    for label, value in mode_options.get("quick", [])
                ],
                "deepModels": [
                    {"label": label, "value": value}
                    for label, value in mode_options.get("deep", [])
                ],
            }
        )

    return {
        "v": 1,
        "type": "options",
        "providers": providers,
        "analysts": [
            {"key": key, "label": label} for key, label in ANALYST_MAPPING.items()
        ],
        "teams": TEAM_LAYOUT,
        "vendorCategories": dict(DEFAULT_CONFIG["data_vendors"]),
        "defaults": {
            "llm_provider": DEFAULT_CONFIG["llm_provider"],
            "deep_think_llm": DEFAULT_CONFIG["deep_think_llm"],
            "quick_think_llm": DEFAULT_CONFIG["quick_think_llm"],
            "backend_url": DEFAULT_CONFIG["backend_url"],
            "output_language": DEFAULT_CONFIG["output_language"],
            "max_debate_rounds": DEFAULT_CONFIG["max_debate_rounds"],
            "max_risk_discuss_rounds": DEFAULT_CONFIG["max_risk_discuss_rounds"],
            "checkpoint_enabled": DEFAULT_CONFIG["checkpoint_enabled"],
            "benchmark_ticker": DEFAULT_CONFIG["benchmark_ticker"],
            "temperature": DEFAULT_CONFIG["temperature"],
            "results_dir": DEFAULT_CONFIG["results_dir"],
        },
    }


def run_command(request: dict[str, Any]) -> int:
    """Execute one analysis run, streaming its events to stdout."""
    from tradingagents.asset_type import detect_asset_type
    from tradingagents.dataflows.symbols import normalize_symbol
    from tradingagents.session import AnalysisSession, normalize_analysts

    ticker = normalize_symbol(str(request.get("ticker") or "").strip())
    if not ticker:
        raise ValueError("request is missing 'ticker'")
    date = str(request.get("date") or "").strip()
    if not date:
        raise ValueError("request is missing 'date'")

    analysts = normalize_analysts(request.get("analysts") or ["market"])
    asset_type = request.get("assetType") or detect_asset_type(ticker)

    session = AnalysisSession(
        ticker,
        date,
        analysts,
        build_config(request.get("config")),
        asset_type=asset_type,
        run_id=request.get("runId"),
    )

    save_path = request.get("savePath")
    for event in session.run():
        payload = event.to_json_obj()
        if event.type == "run_finished" and save_path:
            # Write the same report tree the CLI writes, so the history view
            # reads one directory layout regardless of which client ran it.
            try:
                report_file = session.graph.save_reports(session.final_state, ticker, save_path)
                payload["reportPath"] = str(report_file)
            except Exception as exc:  # noqa: BLE001 - report saving is best effort
                emit_error(f"failed to save report: {exc}", recoverable=True)
        emit(payload)
    return 0


def main(argv: list[str] | None = None) -> int:
    import signal

    argv = list(sys.argv if argv is None else argv)
    _protect_stdout()

    global _cancel_reported
    _cancel_reported = False

    def _cancel(signum, frame):  # noqa: ARG001 - signal handler signature
        timer = threading.Timer(CANCEL_GRACE_SECONDS, _finish_cancelled)
        timer.daemon = True
        timer.start()
        raise _Cancelled

    # Default SIGTERM would kill the process outright, skipping the session's
    # finally block and leaving the checkpointer open. Turning it into an
    # exception lets the run unwind properly (PROTOCOL.md, "Cancellation").
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, _cancel)

    try:
        request = read_request(argv)
    except Exception as exc:  # noqa: BLE001 - any parse failure is terminal
        emit_error(f"invalid request: {exc}")
        return 1

    try:
        command = request.get("command", "run")
        if command == "options":
            emit(options_payload())
            return 0
        if command == "market_list":
            from tradingagents.market_catalog import market_list

            emit(market_list(request.get("market")))
            return 0
        if command == "symbol_search":
            from tradingagents.market_catalog import symbol_search

            emit(symbol_search(request.get("market"), request.get("query")))
            return 0
        return run_command(request)
    except _Cancelled:
        # The run's finally blocks have already torn the checkpointer down.
        _finish_cancelled()
    except Exception as exc:  # noqa: BLE001 - report, then exit non-zero
        traceback.print_exc()
        emit_error(f"{type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
