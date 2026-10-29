/**
 * Hand-aligned mirror of `tradingagents/PROTOCOL.md`.
 *
 * PROTOCOL.md is the source of truth: when the two disagree, Python wins.
 * Every event carries `v`; `isSupportedEvent` rejects unknown versions loudly
 * instead of letting the UI render a shape it does not understand.
 */

export const PROTOCOL_VERSION = 1

export const SECTION_KEYS = [
  'market_report',
  'sentiment_report',
  'news_report',
  'fundamentals_report',
  'investment_plan',
  'trader_investment_plan',
  'final_trade_decision'
] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export const ANALYST_KEYS = ['market', 'social', 'news', 'fundamentals'] as const
export type AnalystKey = (typeof ANALYST_KEYS)[number]

export type AgentStatus = 'pending' | 'in_progress' | 'completed'
export type MessageRole = 'User' | 'Agent' | 'Data' | 'Control' | 'System'
export type AssetType = 'stock' | 'crypto'

export type RunEvent =
  | {
      v: 1
      type: 'run_started'
      runId: string
      ticker: string
      date: string
      assetType: AssetType
      analysts: AnalystKey[]
    }
  | { v: 1; type: 'agent_status'; agent: string; status: AgentStatus }
  | { v: 1; type: 'report_section'; section: SectionKey; content: string }
  | { v: 1; type: 'tool_call'; name: string; args: unknown }
  | { v: 1; type: 'message'; role: MessageRole; content: string }
  | {
      v: 1
      type: 'run_finished'
      runId: string
      signal: string | null
      isReview: boolean
      reportPath?: string
    }
  | {
      v: 1
      type: 'error'
      message: string
      recoverable: boolean
      code?: 'cancelled' | 'failed'
    }
  | { v: 1; type: 'options'; [key: string]: unknown }

export interface RunRequest {
  v?: number
  command?: 'run' | 'options'
  runId?: string
  ticker: string
  date: string
  analysts: AnalystKey[]
  assetType?: AssetType
  config?: Record<string, unknown>
  savePath?: string
}

export interface ProviderOption {
  id: string
  apiKeyEnv: string | null
  supportsCustomEndpoint: boolean
  quickModels: { label: string; value: string }[]
  deepModels: { label: string; value: string }[]
}

export interface OptionsPayload {
  providers: ProviderOption[]
  analysts: { key: AnalystKey; label: string }[]
  teams: Record<string, string[]>
  vendorCategories: Record<string, string>
  defaults: Record<string, unknown>
}

export const MARKET_KEYS = ['us', 'crypto', 'hk', 'cn'] as const
export type MarketKey = (typeof MARKET_KEYS)[number]

export interface MarketItem {
  symbol: string
  name: string
  exchange: string | null
  currency: string | null
  price: number | null
  changePercent: number | null
  marketCap: number | null
}

export interface MarketListPayload {
  v: 1
  type: 'market_list'
  market: MarketKey
  items: MarketItem[]
}

export interface SymbolSearchPayload {
  v: 1
  type: 'symbol_search'
  market: MarketKey
  query: string
  items: MarketItem[]
}

/** A parsed stdout line is only usable when it is an object of a known version. */
export function isSupportedEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as { v?: unknown; type?: unknown }
  return event.v === PROTOCOL_VERSION && typeof event.type === 'string'
}

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value)
}

/**
 * Pipeline grouping, mirroring `TEAM_LAYOUT` in `tradingagents/session.py`.
 * Analysts that were not selected simply never receive a status event.
 */
export const TEAM_LAYOUT: Record<string, string[]> = {
  'Analyst Team': [
    'Market Analyst',
    'Sentiment Analyst',
    'News Analyst',
    'Fundamentals Analyst'
  ],
  'Research Team': ['Bull Researcher', 'Bear Researcher', 'Research Manager'],
  'Trading Team': ['Trader'],
  'Risk Management': ['Aggressive Analyst', 'Neutral Analyst', 'Conservative Analyst'],
  'Portfolio Management': ['Portfolio Manager']
}

/** Section -> the agent whose completion makes that section final. */
export const SECTION_FINALIZER: Record<SectionKey, string> = {
  market_report: 'Market Analyst',
  sentiment_report: 'Sentiment Analyst',
  news_report: 'News Analyst',
  fundamentals_report: 'Fundamentals Analyst',
  investment_plan: 'Research Manager',
  trader_investment_plan: 'Trader',
  final_trade_decision: 'Portfolio Manager'
}

/** Which analyst selection gates each section (null = always present). */
export const SECTION_ANALYST: Record<SectionKey, AnalystKey | null> = {
  market_report: 'market',
  sentiment_report: 'social',
  news_report: 'news',
  fundamentals_report: 'fundamentals',
  investment_plan: null,
  trader_investment_plan: null,
  final_trade_decision: null
}
