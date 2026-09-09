/**
 * The persisted (non-secret) settings shape, shared by main and renderer.
 *
 * API keys are deliberately absent: they live in the OS keychain and never
 * cross into the renderer. See `src/main/keychain.ts`.
 */

import type { AnalystKey } from './protocol'

export interface Settings {
  llmProvider: string
  deepThinkLlm: string
  quickThinkLlm: string
  /** Only meaningful for ollama / openai_compatible; null = provider default. */
  backendUrl: string | null
  outputLanguage: string
  maxDebateRounds: number
  maxRiskRounds: number
  /** null = do not send a temperature at all (not the same as 0). */
  temperature: number | null
  maxTokens: number | null
  llmMaxRetries: number | null
  googleThinkingLevel: string | null
  openaiReasoningEffort: string | null
  anthropicEffort: string | null
  checkpointEnabled: boolean
  benchmarkTicker: string | null
  dataVendors: Record<string, string>
  defaultAnalysts: AnalystKey[]
  /** Opt-in convenience for users who also run the CLI. Off by default. */
  alsoWriteDotEnv: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  llmProvider: 'openai',
  deepThinkLlm: 'gpt-5.6',
  quickThinkLlm: 'gpt-5.6-luna',
  backendUrl: null,
  outputLanguage: '中文',
  maxDebateRounds: 1,
  maxRiskRounds: 1,
  temperature: null,
  maxTokens: null,
  llmMaxRetries: null,
  googleThinkingLevel: null,
  openaiReasoningEffort: null,
  anthropicEffort: null,
  checkpointEnabled: false,
  benchmarkTicker: null,
  dataVendors: {
    core_stock_apis: 'yfinance',
    technical_indicators: 'yfinance',
    fundamental_data: 'yfinance',
    news_data: 'yfinance',
    macro_data: 'fred',
    prediction_markets: 'polymarket'
  },
  defaultAnalysts: ['market', 'social', 'news', 'fundamentals'],
  alsoWriteDotEnv: false
}

/** Providers whose endpoint is user-supplied; everyone else picks their own. */
export const CUSTOM_ENDPOINT_PROVIDERS = ['ollama', 'openai_compatible']
