"""Headless analysis session shared by the CLI and the desktop sidecar.

:class:`AnalysisSession` drives ``TradingAgentsGraph.graph.stream(...)`` and
translates every LangGraph chunk into a flat stream of :class:`RunEvent`
objects. It owns the whole run lifecycle: initial state, checkpoint setup and
teardown, message de-duplication, agent-status transitions and report-section
updates.

Two consumers exist:

* ``cli/main.py`` — applies the events to its ``MessageBuffer`` and repaints
  the rich dashboard.
* ``tradingagents.ipc_main`` — serialises the events to stdout as JSON Lines
  for the Electron desktop client.

The event stream is the contract; see ``tradingagents/PROTOCOL.md``. Anything
that changes the shape of an event must bump ``PROTOCOL_VERSION`` there and
here in lockstep.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any

from tradingagents.graph.analyst_execution import (
    AnalystWallTimeTracker,
    build_analyst_execution_plan,
    get_initial_analyst_node,
    sync_analyst_tracker_from_chunk,
)
from tradingagents.graph.trading_graph import TradingAgentsGraph

# Bumped whenever the wire shape of a RunEvent changes. Consumers must reject
# versions they do not understand rather than render them optimistically.
PROTOCOL_VERSION = 1

# Teams that always run; not user-selectable.
FIXED_AGENTS: dict[str, list[str]] = {
    "Research Team": ["Bull Researcher", "Bear Researcher", "Research Manager"],
    "Trading Team": ["Trader"],
    "Risk Management": ["Aggressive Analyst", "Neutral Analyst", "Conservative Analyst"],
    "Portfolio Management": ["Portfolio Manager"],
}

# Analyst selection key -> display name.
ANALYST_MAPPING: dict[str, str] = {
    "market": "Market Analyst",
    "social": "Sentiment Analyst",
    "news": "News Analyst",
    "fundamentals": "Fundamentals Analyst",
}

# Report section -> (analyst_key gating inclusion, agent that finalizes it).
# analyst_key None means the section is always part of a run.
REPORT_SECTIONS: dict[str, tuple[str | None, str]] = {
    "market_report": ("market", "Market Analyst"),
    "sentiment_report": ("social", "Sentiment Analyst"),
    "news_report": ("news", "News Analyst"),
    "fundamentals_report": ("fundamentals", "Fundamentals Analyst"),
    "investment_plan": (None, "Research Manager"),
    "trader_investment_plan": (None, "Trader"),
    "final_trade_decision": (None, "Portfolio Manager"),
}

# Canonical analyst ordering used for status transitions and normalization.
ANALYST_ORDER: list[str] = ["market", "social", "news", "fundamentals"]

# Analyst selection key -> the state field holding that analyst's report.
ANALYST_REPORT_MAP: dict[str, str] = {
    "market": "market_report",
    "social": "sentiment_report",
    "news": "news_report",
    "fundamentals": "fundamentals_report",
}

# Team grouping used for progress layout (CLI table / desktop pipeline column).
TEAM_LAYOUT: dict[str, list[str]] = {
    "Analyst Team": list(ANALYST_MAPPING.values()),
    **FIXED_AGENTS,
}

# Human-readable heading per report section.
SECTION_TITLES: dict[str, str] = {
    "market_report": "Market Analysis",
    "sentiment_report": "Social Sentiment",
    "news_report": "News Analysis",
    "fundamentals_report": "Fundamentals Analysis",
    "investment_plan": "Research Team Decision",
    "trader_investment_plan": "Trading Team Plan",
    "final_trade_decision": "Portfolio Management Decision",
}

RESEARCH_TEAM: list[str] = FIXED_AGENTS["Research Team"]


@dataclass(frozen=True)
class RunEvent:
    """One protocol event. ``data`` is flattened into the JSON object."""

    type: str
    data: dict[str, Any] = field(default_factory=dict)

    def to_json_obj(self) -> dict[str, Any]:
        return {"v": PROTOCOL_VERSION, "type": self.type, **self.data}


def normalize_analysts(selected: Iterable[str]) -> list[str]:
    """Lowercase and reorder an analyst selection to ``ANALYST_ORDER``.

    Selection arrives as a set (CLI checkbox) or arbitrary JSON array
    (desktop), but the graph is wired in a fixed order.
    """
    chosen = {str(a).lower() for a in selected}
    unknown = chosen - set(ANALYST_ORDER)
    if unknown:
        raise ValueError(f"unknown analyst key(s): {', '.join(sorted(unknown))}")
    return [key for key in ANALYST_ORDER if key in chosen]


def extract_content_string(content: Any) -> str | None:
    """Extract string content from various message formats.

    Returns None if no meaningful text content is found.
    """
    import ast

    def is_empty(val):
        """Check if value is empty using Python's truthiness."""
        if val is None or val == "":
            return True
        if isinstance(val, str):
            s = val.strip()
            if not s:
                return True
            try:
                return not bool(ast.literal_eval(s))
            except (ValueError, SyntaxError):
                return False  # Can't parse = real text
        return not bool(val)

    if is_empty(content):
        return None

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, dict):
        text = content.get("text", "")
        return text.strip() if not is_empty(text) else None

    if isinstance(content, list):
        text_parts = [
            item.get("text", "").strip()
            if isinstance(item, dict) and item.get("type") == "text"
            else (item.strip() if isinstance(item, str) else "")
            for item in content
        ]
        result = " ".join(t for t in text_parts if t and not is_empty(t))
        return result if result else None

    return str(content).strip() if not is_empty(content) else None


def classify_message_type(message: Any) -> tuple[str, str | None]:
    """Classify a LangChain message into display type and extract content.

    Returns:
        (type, content) - type is one of: User, Agent, Data, Control, System
                        - content is extracted string or None
    """
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    content = extract_content_string(getattr(message, "content", None))

    if isinstance(message, HumanMessage):
        if content and content.strip() == "Continue":
            return ("Control", content)
        return ("User", content)

    if isinstance(message, ToolMessage):
        return ("Data", content)

    if isinstance(message, AIMessage):
        return ("Agent", content)

    # Fallback for unknown types
    return ("System", content)


class AnalysisSession:
    """Run one analysis and emit :class:`RunEvent` objects as it progresses.

    The session keeps its own mirror of agent statuses and report sections so
    status transitions can be derived from accumulated state rather than from a
    single chunk. Consumers stay purely presentational.

    Exceptions raised by the graph propagate to the caller; the checkpointer is
    always torn down first. The desktop sidecar turns them into ``error``
    events, the CLI lets them surface as before.
    """

    def __init__(
        self,
        ticker: str,
        analysis_date: str,
        selected_analysts: Iterable[str],
        config: dict,
        asset_type: str = "stock",
        callbacks: list | None = None,
        debug: bool = True,
        run_id: str | None = None,
        graph: TradingAgentsGraph | None = None,
    ):
        self.ticker = ticker
        self.analysis_date = str(analysis_date)
        self.asset_type = asset_type
        self.config = config
        self.run_id = run_id or uuid.uuid4().hex
        self.callbacks = list(callbacks) if callbacks else []
        self.selected_analysts = normalize_analysts(selected_analysts)
        self.execution_plan = build_analyst_execution_plan(self.selected_analysts)
        self.wall_time_tracker = AnalystWallTimeTracker(self.execution_plan)
        self.graph = graph if graph is not None else TradingAgentsGraph(
            self.selected_analysts,
            config=config,
            debug=debug,
            callbacks=self.callbacks or None,
        )

        self.agent_status: dict[str, str] = {}
        self.report_sections: dict[str, str | None] = {}
        self.final_state: dict[str, Any] = {}
        self.signal: str | None = None
        self._processed_message_ids: set = set()
        self._init_state()

    # ------------------------------------------------------------------
    # State setup
    # ------------------------------------------------------------------
    def _init_state(self) -> None:
        """Build agent status and report section maps for this selection."""
        self.agent_status = {}
        for analyst_key in self.selected_analysts:
            self.agent_status[ANALYST_MAPPING[analyst_key]] = "pending"
        for team_agents in FIXED_AGENTS.values():
            for agent in team_agents:
                self.agent_status[agent] = "pending"

        self.report_sections = {}
        for section, (analyst_key, _) in REPORT_SECTIONS.items():
            if analyst_key is None or analyst_key in self.selected_analysts:
                self.report_sections[section] = None

    def completed_reports_count(self) -> int:
        """Count sections that have content AND whose finalizing agent is done."""
        count = 0
        for section in self.report_sections:
            if section not in REPORT_SECTIONS:
                continue
            _, finalizing_agent = REPORT_SECTIONS[section]
            has_content = self.report_sections.get(section) is not None
            agent_done = self.agent_status.get(finalizing_agent) == "completed"
            if has_content and agent_done:
                count += 1
        return count

    # ------------------------------------------------------------------
    # Event emitters (mutate mirror state, then yield)
    # ------------------------------------------------------------------
    def _agent_event(self, agent: str, status: str) -> Iterator[RunEvent]:
        # Unknown agents (e.g. an unselected analyst) are ignored, matching the
        # CLI's MessageBuffer.update_agent_status guard.
        if agent in self.agent_status:
            self.agent_status[agent] = status
            yield RunEvent("agent_status", {"agent": agent, "status": status})

    def _section_event(self, section: str, content: str) -> Iterator[RunEvent]:
        # Full replacement, not append — same semantics as update_report_section.
        if section in self.report_sections:
            self.report_sections[section] = content
            yield RunEvent("report_section", {"section": section, "content": content})

    def _message_event(self, role: str, content: str) -> Iterator[RunEvent]:
        yield RunEvent("message", {"role": role, "content": content})

    def _research_team_event(self, status: str) -> Iterator[RunEvent]:
        """Move all research team members (not the Trader) to ``status``."""
        for agent in RESEARCH_TEAM:
            yield from self._agent_event(agent, status)

    # ------------------------------------------------------------------
    # Chunk translation
    # ------------------------------------------------------------------
    def _analyst_status_events(self, chunk: dict) -> Iterator[RunEvent]:
        """Derive analyst statuses from accumulated report state.

        - Store new report content present in this chunk
        - Analysts with a report are completed
        - The first analyst without one is in_progress, the rest pending
        - Once every analyst is done, the Bull Researcher starts
        """
        found_active = False
        sync_analyst_tracker_from_chunk(self.wall_time_tracker, chunk)

        for analyst_key in ANALYST_ORDER:
            if analyst_key not in self.selected_analysts:
                continue

            agent_name = ANALYST_MAPPING[analyst_key]
            report_key = ANALYST_REPORT_MAP[analyst_key]

            if chunk.get(report_key):
                yield from self._section_event(report_key, chunk[report_key])

            # Status comes from accumulated sections, not just this chunk.
            has_report = bool(self.report_sections.get(report_key))

            if has_report:
                yield from self._agent_event(agent_name, "completed")
            elif not found_active:
                yield from self._agent_event(agent_name, "in_progress")
                found_active = True
            else:
                yield from self._agent_event(agent_name, "pending")

        if (
            not found_active
            and self.selected_analysts
            and self.agent_status.get("Bull Researcher") == "pending"
        ):
            yield from self._agent_event("Bull Researcher", "in_progress")

    def _message_events(self, chunk: dict) -> Iterator[RunEvent]:
        """Emit message/tool_call events, de-duplicated by message id.

        ``stream_mode="values"`` hands back the full accumulated message list on
        every chunk, so without the id set every message would be re-emitted
        once per chunk.
        """
        for message in chunk.get("messages", []):
            msg_id = getattr(message, "id", None)
            if msg_id is not None:
                if msg_id in self._processed_message_ids:
                    continue
                self._processed_message_ids.add(msg_id)

            msg_type, content = classify_message_type(message)
            if content and content.strip():
                yield from self._message_event(msg_type, content)

            if getattr(message, "tool_calls", None):
                for tool_call in message.tool_calls:
                    if isinstance(tool_call, dict):
                        name, args = tool_call["name"], tool_call["args"]
                    else:
                        name, args = tool_call.name, tool_call.args
                    yield RunEvent("tool_call", {"name": name, "args": args})

    def _research_events(self, chunk: dict) -> Iterator[RunEvent]:
        debate_state = chunk.get("investment_debate_state")
        if not debate_state:
            return
        bull_hist = debate_state.get("bull_history", "").strip()
        bear_hist = debate_state.get("bear_history", "").strip()
        judge = debate_state.get("judge_decision", "").strip()

        # Only move statuses once there is actual content.
        if bull_hist or bear_hist:
            yield from self._research_team_event("in_progress")
        if bull_hist:
            yield from self._section_event(
                "investment_plan", f"### Bull Researcher Analysis\n{bull_hist}"
            )
        if bear_hist:
            yield from self._section_event(
                "investment_plan", f"### Bear Researcher Analysis\n{bear_hist}"
            )
        if judge:
            yield from self._section_event(
                "investment_plan", f"### Research Manager Decision\n{judge}"
            )
            yield from self._research_team_event("completed")
            yield from self._agent_event("Trader", "in_progress")

    def _trading_events(self, chunk: dict) -> Iterator[RunEvent]:
        if not chunk.get("trader_investment_plan"):
            return
        yield from self._section_event(
            "trader_investment_plan", chunk["trader_investment_plan"]
        )
        if self.agent_status.get("Trader") != "completed":
            yield from self._agent_event("Trader", "completed")
            yield from self._agent_event("Aggressive Analyst", "in_progress")

    def _risk_events(self, chunk: dict) -> Iterator[RunEvent]:
        risk_state = chunk.get("risk_debate_state")
        if not risk_state:
            return
        agg_hist = risk_state.get("aggressive_history", "").strip()
        con_hist = risk_state.get("conservative_history", "").strip()
        neu_hist = risk_state.get("neutral_history", "").strip()
        judge = risk_state.get("judge_decision", "").strip()

        if agg_hist:
            if self.agent_status.get("Aggressive Analyst") != "completed":
                yield from self._agent_event("Aggressive Analyst", "in_progress")
            yield from self._section_event(
                "final_trade_decision", f"### Aggressive Analyst Analysis\n{agg_hist}"
            )
        if con_hist:
            if self.agent_status.get("Conservative Analyst") != "completed":
                yield from self._agent_event("Conservative Analyst", "in_progress")
            yield from self._section_event(
                "final_trade_decision", f"### Conservative Analyst Analysis\n{con_hist}"
            )
        if neu_hist:
            if self.agent_status.get("Neutral Analyst") != "completed":
                yield from self._agent_event("Neutral Analyst", "in_progress")
            yield from self._section_event(
                "final_trade_decision", f"### Neutral Analyst Analysis\n{neu_hist}"
            )
        if judge and self.agent_status.get("Portfolio Manager") != "completed":
            yield from self._agent_event("Portfolio Manager", "in_progress")
            yield from self._section_event(
                "final_trade_decision", f"### Portfolio Manager Decision\n{judge}"
            )
            yield from self._agent_event("Aggressive Analyst", "completed")
            yield from self._agent_event("Conservative Analyst", "completed")
            yield from self._agent_event("Neutral Analyst", "completed")
            yield from self._agent_event("Portfolio Manager", "completed")

    def translate_chunk(self, chunk: dict) -> Iterator[RunEvent]:
        """Translate one LangGraph chunk into events, in CLI-equivalent order."""
        yield from self._message_events(chunk)
        yield from self._analyst_status_events(chunk)
        yield from self._research_events(chunk)
        yield from self._trading_events(chunk)
        yield from self._risk_events(chunk)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def _initial_state(self) -> dict:
        # Resolve the instrument identity once so every agent anchors to the
        # same company (#814); the streaming path builds state directly instead
        # of going through propagate().
        instrument_context = self.graph.resolve_instrument_context(
            self.ticker, self.asset_type
        )
        return self.graph.propagator.create_initial_state(
            self.ticker,
            self.analysis_date,
            asset_type=self.asset_type,
            instrument_context=instrument_context,
        )

    def run(self) -> Iterator[RunEvent]:
        """Execute the graph, yielding events until the run finishes."""
        yield RunEvent(
            "run_started",
            {
                "runId": self.run_id,
                "ticker": self.ticker,
                "date": self.analysis_date,
                "assetType": self.asset_type,
                "analysts": list(self.selected_analysts),
            },
        )

        first_analyst = get_initial_analyst_node(self.execution_plan)
        yield from self._agent_event(first_analyst, "in_progress")
        self.wall_time_tracker.mark_started(self.selected_analysts[0])

        init_agent_state = self._initial_state()
        args = self.graph.propagator.get_graph_args(callbacks=self.callbacks or None)

        # Recompile with a checkpointer and inject the thread_id so checkpoint
        # resume actually works on the streaming path (#1249); a no-op when
        # checkpointing is disabled. Torn down in the finally below.
        checkpoint_tid = self.graph.begin_checkpoint(
            self.ticker, self.analysis_date, self.asset_type
        )
        if checkpoint_tid is not None:
            args.setdefault("config", {}).setdefault("configurable", {})[
                "thread_id"
            ] = checkpoint_tid

        # On resume, feed None so LangGraph continues the interrupted run
        # instead of re-appending the initial state (#1249).
        trace: list[dict] = []
        try:
            graph_input = self.graph.checkpoint_input(init_agent_state)
            for chunk in self.graph.graph.stream(graph_input, **args):
                yield from self.translate_chunk(chunk)
                trace.append(chunk)

            # Clean run: drop this run's checkpoint so a later run starts
            # fresh. A mid-stream failure skips this, keeping it for resume.
            self.graph.clear_checkpoint_on_success(
                self.ticker, self.analysis_date, self.asset_type
            )
        finally:
            # Always restore the plain uncheckpointed graph, even on failure.
            self.graph.end_checkpoint()

        yield from self._finalize(trace)

    def _finalize(self, trace: list[dict]) -> Iterator[RunEvent]:
        # Streamed chunks are per-node deltas, not full state. Merge them so
        # every report field populated across the run is present.
        final_state: dict[str, Any] = {}
        for chunk in trace:
            final_state.update(chunk)
        self.final_state = final_state

        for agent in list(self.agent_status):
            yield from self._agent_event(agent, "completed")

        yield from self._message_event(
            "System", f"Completed analysis for {self.analysis_date}"
        )
        yield from self._message_event("System", self.wall_time_tracker.format_summary())

        for section in list(self.report_sections):
            if section in final_state:
                yield from self._section_event(section, final_state[section])

        # Deterministic parse of the PM decision — no extra LLM call (#1170).
        decision = final_state.get("final_trade_decision") or ""
        self.signal = self.graph.process_signal(decision) if decision else None
        yield RunEvent(
            "run_finished",
            {
                "runId": self.run_id,
                "signal": self.signal,
                "isReview": is_review_signal(self.signal),
            },
        )


def is_review_signal(signal: str | None) -> bool:
    """True when the run produced no parseable 5-tier rating."""
    from tradingagents.agents.utils.rating import is_review

    return signal is None or is_review(signal)
