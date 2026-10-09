# Desktop IPC protocol (v1)

Single source of truth for the stdio contract between the Python sidecar
(`tradingagents.ipc_main`) and the Electron main process. The TypeScript
mirror lives in `desktop/src/shared/protocol.ts` and is aligned by hand — when
the two disagree, **this file wins**.

## Transport

- One process per run. The desktop app spawns
  `python -m tradingagents.ipc_main <request-json>` (or feeds the request as a
  single line on stdin) and reads **stdout**.
- **stdout is JSON Lines**: exactly one compact JSON object per line, UTF-8,
  flushed after every write. Nothing else is ever written there — the sidecar
  rebinds `sys.stdout` to `sys.stderr` on startup so stray `print()` calls in
  the data layer cannot corrupt the stream.
- **stderr is free-form logs**. Surface it in a debug pane, never parse it.
- Lines can be tens of kilobytes (a full report section). Read with a line
  reader, not a fixed-size buffer.
- Exit code `0` means the run finished (or was cancelled cleanly), `1` means it
  failed; an `error` event is always emitted before a non-zero exit.

## Request

```jsonc
{
  "v": 1,
  "command": "run",              // "run" (default) | "options"
  "runId": "e6c1…",              // optional; generated when absent
  "ticker": "NVDA",
  "date": "2026-01-02",
  "analysts": ["market", "social", "news", "fundamentals"],
  "assetType": "stock",          // optional; auto-detected from the ticker
  "config": { "max_debate_rounds": 2 },  // optional DEFAULT_CONFIG overrides
  "savePath": "/…/reports/NVDA_20260102_101500"  // optional report tree target
}
```

Everything else (provider, models, temperature, data vendors, keys) is passed
as **environment variables** on spawn. `TRADINGAGENTS_*` values are coerced at
import time and a bad value raises before the first event is emitted, so the
renderer must validate number/boolean fields before spawning.

`command: "options"` skips the run entirely and prints one `options` event
describing providers, models, analysts and vendor categories, so the settings
UI never hard-codes a second copy of the catalog.

## Events

Every event is flat and carries `v`. Consumers must reject unknown `v` values
loudly rather than render them optimistically. Unknown `type` values should be
ignored (forward compatibility).

| type | payload | notes |
|---|---|---|
| `run_started` | `runId`, `ticker`, `date`, `assetType`, `analysts` | always first |
| `agent_status` | `agent`, `status` | `status` ∈ `pending` \| `in_progress` \| `completed` |
| `report_section` | `section`, `content` | Markdown, **full replacement** |
| `tool_call` | `name`, `args` | `args` is arbitrary JSON |
| `message` | `role`, `content` | `role` ∈ `User` \| `Agent` \| `Data` \| `Control` \| `System` |
| `run_finished` | `runId`, `signal`, `isReview`, `reportPath?` | always last on success |
| `error` | `message`, `recoverable`, `code?` | terminal; `code` is `cancelled` \| `failed` |
| `options` | `providers`, `analysts`, `vendorCategories`, `defaults` | only for `command: "options"` |

### Sections

`section` is one of the seven keys, matching the agent graph's state fields:

`market_report`, `sentiment_report`, `news_report`, `fundamentals_report`,
`investment_plan`, `trader_investment_plan`, `final_trade_decision`.

`report_section` **replaces** the section body; it never appends. Debate rounds
re-emit the same section with progressively fuller content, and the last write
of a run is the authoritative one.

### Agents

Agent names are display names, grouped for layout as:

- Analyst Team — Market / Sentiment / News / Fundamentals Analyst
  (only the selected ones appear)
- Research Team — Bull Researcher, Bear Researcher, Research Manager
- Trading Team — Trader
- Risk Management — Aggressive, Neutral, Conservative Analyst
- Portfolio Management — Portfolio Manager

The selected analysts run in parallel: they all become `in_progress` right
after `run_started` and each turns `completed` when its own report lands, so
several can be `in_progress` at once. The Bull Researcher starts when the
slowest has filed.

Statuses are derived from accumulated state, so an agent can move back to
`pending`; render the latest value rather than assuming monotonic progress.

### Signals

`signal` is one of the five ratings (`Buy`, `Overweight`, `Hold`,
`Underweight`, `Sell`) or `REVIEW` when the Portfolio Manager's decision had no
parseable rating. **Do not assume five values** — branch on the `isReview`
boolean, which the Python side has already computed.

## Cancellation

`SIGTERM` (or `SIGINT`) unwinds the run through its `finally` blocks so the
checkpoint is torn down, then emits
`{"v":1,"type":"error","message":"run cancelled","recoverable":true,"code":"cancelled"}`
and exits `0`. Give the process a few seconds before escalating to `SIGKILL`.

Two details make that actually work, both learned the hard way:

* The cancellation exception derives from `BaseException`. LangGraph and the
  LLM SDKs wrap node execution in `except Exception`, which swallows an
  ordinary exception and lets the run continue billing after the user pressed
  stop.
* The sidecar hard-exits once the event is written. LangGraph leaves
  non-daemon worker threads behind, and a normal return blocks in
  `threading._shutdown` until the in-flight LLM call returns — long past the
  caller's SIGKILL deadline.

## Versioning

Adding an optional field to an existing event is backwards compatible and does
not bump `v`. Renaming or removing a field, or changing a field's meaning,
bumps `PROTOCOL_VERSION` in `tradingagents/session.py`, this document, and
`desktop/src/shared/protocol.ts` together.
