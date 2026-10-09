"""The shared session must translate graph chunks into the documented events.

These cover the invariants the desktop client depends on: message
de-duplication across ``stream_run`` steps, full-replacement report sections,
parallel analyst status transitions and checkpoint teardown.
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
    def get_graph_args(self, callbacks=None):
        return {"config": {"recursion_limit": 100}}


class FakeGraph:
    """Minimal stand-in for TradingAgentsGraph's streaming surface.

    ``steps`` are the run's states, each streamed as ``(messages, state)`` the way
    ``stream_run`` does. A step given as a ``(messages, None)`` tuple stands for a
    step inside an analyst's own graph, which carries messages only.
    """

    def __init__(self, steps, thread_id=None):
        self.steps = steps
        self.propagator = FakePropagator()
        self.thread_id = thread_id
        self.stream_calls = []
        self.run_states = []
        self.recorded = []
        self.ended = 0
        self.cleared = 0

    def create_run_state(self, ticker, trade_date, asset_type="stock", portfolio=None):
        self.run_states.append((ticker, trade_date, asset_type))
        return {"messages": []}

    def begin_checkpoint(self, *args, **kwargs):
        return self.thread_id

    def checkpoint_input(self, init_state):
        return init_state

    def stream_run(self, graph_input, **kwargs):
        self.stream_calls.append((graph_input, kwargs))
        for step in self.steps:
            if isinstance(step, tuple):
                yield step
            else:
                yield step.get("messages", []), step

    def record_decision(self, ticker, trade_date, final_state):
        self.recorded.append((ticker, trade_date, dict(final_state)))

    def clear_checkpoint_on_success(self, *args, **kwargs):
        self.cleared += 1

    def end_checkpoint(self):
        self.ended += 1


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
        session = build_session([{"messages": [], "final_trade_decision": "Rating: Buy"}])
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
        # A full-state step re-sends the whole accumulated message list.
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
                    },
                    "investment_plan": "go long",
                }
            ]
        )
        events = list(session.run())
        statuses = [(e.data["agent"], e.data["status"]) for e in events if e.type == "agent_status"]
        self.assertIn(("Research Manager", "completed"), statuses)
        self.assertIn(("Trader", "in_progress"), statuses)

        # investment_plan is replaced, not appended: the judge decision wins.
        plans = [
            e.data["content"]
            for e in events
            if e.type == "report_section" and e.data["section"] == "investment_plan"
        ]
        self.assertEqual(plans[-2], "### Research Manager Decision\ngo long")

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
        _, kwargs = session.graph.stream_calls[0]
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
        session = build_session([{"messages": [], "final_trade_decision": "???"}])
        finished = list(session.run())[-1]
        self.assertEqual(finished.data["signal"], "REVIEW")
        self.assertTrue(finished.data["isReview"])

    def test_every_selected_analyst_starts_together(self):
        session = build_session([{"messages": []}], analysts=("market", "news"))
        started = [
            e.data["agent"]
            for e in session.run()
            if e.type == "agent_status" and e.data["status"] == "in_progress"
        ]
        self.assertEqual(started[:2], ["Market Analyst", "News Analyst"])

    def test_research_waits_for_the_slowest_analyst(self):
        session = build_session(
            [{"messages": [], "market_report": "# MKT"}, {"messages": [], "news_report": "# NEWS"}],
            analysts=("market", "news"),
        )
        order = []
        for event in session.run():
            if event.type == "agent_status":
                order.append((event.data["agent"], event.data["status"]))
        first_bull = order.index(("Bull Researcher", "in_progress"))
        self.assertLess(order.index(("Market Analyst", "completed")), first_bull)
        self.assertLess(order.index(("News Analyst", "completed")), first_bull)
        self.assertNotIn(
            ("Bull Researcher", "in_progress"),
            order[: order.index(("News Analyst", "completed"))],
        )

    def test_a_step_inside_an_analyst_graph_carries_messages_only(self):
        inner = ([FakeMessage("fetching", msg_id="a1")], None)
        session = build_session([inner, {"messages": [], "market_report": "# MKT"}])
        events = list(session.run())
        texts = [e.data["content"] for e in events if e.type == "message"]
        self.assertIn("fetching", texts)
        self.assertEqual(
            [e.data["section"] for e in events if e.type == "report_section"][0], "market_report"
        )

    def test_decision_is_recorded_once_a_run_finishes(self):
        session = build_session([{"messages": [], "final_trade_decision": "Rating: Buy"}])
        list(session.run())
        self.assertEqual(len(session.graph.recorded), 1)
        ticker, date, state = session.graph.recorded[0]
        self.assertEqual((ticker, date), ("NVDA", "2026-01-02"))
        self.assertEqual(state["final_trade_decision"], "Rating: Buy")

    def test_failed_run_records_nothing(self):
        def exploding():
            yield {"messages": []}
            raise RuntimeError("boom")

        session = build_session(exploding())
        with self.assertRaises(RuntimeError):
            list(session.run())
        self.assertEqual(session.graph.recorded, [])

    def test_wall_time_summary_names_each_finished_analyst(self):
        session = build_session([{"messages": [], "market_report": "# MKT"}])
        summary = [
            e.data["content"]
            for e in session.run()
            if e.type == "message" and e.data["content"].startswith("Analyst wall time")
        ]
        self.assertEqual(len(summary), 1)
        self.assertIn("Market ", summary[0])

    def test_repeated_full_state_steps_do_not_replay_finished_work(self):
        full = {
            "messages": [],
            "market_report": "# MKT",
            "investment_debate_state": {"bull_history": "bull", "bear_history": "bear"},
            "investment_plan": "go long",
            "trader_investment_plan": "buy",
        }
        session = build_session([full, full, full])
        events = list(session.run())

        statuses = [(e.data["agent"], e.data["status"]) for e in events if e.type == "agent_status"]
        self.assertEqual(statuses.count(("Bull Researcher", "in_progress")), 1)
        self.assertEqual(statuses.count(("Trader", "completed")), 1)
        # The closing pass re-files each section from the final state; only the
        # steps before it are compared.
        done = next(
            i for i, e in enumerate(events)
            if e.type == "message" and e.data["content"].startswith("Completed analysis")
        )
        sections = [e.data["section"] for e in events[:done] if e.type == "report_section"]
        self.assertEqual(sections.count("market_report"), 1)
        self.assertEqual(sections.count("investment_plan"), 1)

    def test_risk_debate_ends_with_the_portfolio_manager_decision(self):
        session = build_session(
            [
                {
                    "messages": [],
                    "trader_investment_plan": "buy",
                    "risk_debate_state": {
                        "aggressive_history": "agg",
                        "conservative_history": "con",
                        "neutral_history": "neu",
                    },
                    "final_trade_decision": "Rating: Buy",
                }
            ]
        )
        events = list(session.run())
        statuses = [(e.data["agent"], e.data["status"]) for e in events if e.type == "agent_status"]
        self.assertIn(("Portfolio Manager", "completed"), statuses)
        final = [
            e.data["content"]
            for e in events
            if e.type == "report_section" and e.data["section"] == "final_trade_decision"
        ]
        self.assertEqual(final[0], "### Portfolio Manager Decision\nRating: Buy")

    def test_completed_reports_count_requires_finalizing_agent(self):
        session = build_session([{"messages": []}])
        session.report_sections["market_report"] = "# MKT"
        self.assertEqual(session.completed_reports_count(), 0)
        session.agent_status["Market Analyst"] = "completed"
        self.assertEqual(session.completed_reports_count(), 1)


if __name__ == "__main__":
    unittest.main()
