/**
 * Turn saved settings + secrets into the child process environment.
 *
 * `tradingagents/__init__.py` loads `.env` with python-dotenv's default
 * `override=False`, so anything injected here already wins over a stale `.env`
 * without touching the core. Values that are null/empty are simply omitted:
 * omitting a key is what "follow the default" means, and an empty string would
 * be coerced (and possibly rejected) by `default_config._coerce`.
 */

import { CUSTOM_ENDPOINT_PROVIDERS, type Settings } from '@shared/settings'

export type EnvMap = Record<string, string>

function put(env: EnvMap, key: string, value: unknown): void {
  if (value === null || value === undefined || value === '') return
  env[key] = String(value)
}

/**
 * Build only the TRADINGAGENTS_* half. Kept pure so it can be unit tested
 * without Electron.
 */
export function buildConfigEnv(settings: Settings): EnvMap {
  const env: EnvMap = {}
  put(env, 'TRADINGAGENTS_LLM_PROVIDER', settings.llmProvider)
  put(env, 'TRADINGAGENTS_DEEP_THINK_LLM', settings.deepThinkLlm)
  put(env, 'TRADINGAGENTS_QUICK_THINK_LLM', settings.quickThinkLlm)
  // A base URL only makes sense where the user actually supplies one; sending
  // OpenAI's /v1 to another provider produces malformed request URLs.
  if (CUSTOM_ENDPOINT_PROVIDERS.includes(settings.llmProvider)) {
    put(env, 'TRADINGAGENTS_LLM_BACKEND_URL', settings.backendUrl)
  }
  put(env, 'TRADINGAGENTS_OUTPUT_LANGUAGE', settings.outputLanguage)
  put(env, 'TRADINGAGENTS_MAX_DEBATE_ROUNDS', settings.maxDebateRounds)
  put(env, 'TRADINGAGENTS_MAX_RISK_ROUNDS', settings.maxRiskRounds)
  put(env, 'TRADINGAGENTS_CHECKPOINT_ENABLED', settings.checkpointEnabled ? 'true' : 'false')
  put(env, 'TRADINGAGENTS_BENCHMARK_TICKER', settings.benchmarkTicker)
  // temperature=0 is a real setting, so only null is dropped.
  if (settings.temperature !== null) env.TRADINGAGENTS_TEMPERATURE = String(settings.temperature)
  put(env, 'TRADINGAGENTS_MAX_TOKENS', settings.maxTokens)
  put(env, 'TRADINGAGENTS_LLM_MAX_RETRIES', settings.llmMaxRetries)
  put(env, 'TRADINGAGENTS_GOOGLE_THINKING_LEVEL', settings.googleThinkingLevel)
  put(env, 'TRADINGAGENTS_OPENAI_REASONING_EFFORT', settings.openaiReasoningEffort)
  put(env, 'TRADINGAGENTS_ANTHROPIC_EFFORT', settings.anthropicEffort)
  return env
}

/**
 * Full spawn environment: inherited env, then config, then secrets.
 *
 * Secrets are added last so a key stored in the app always beats a stale value
 * inherited from the shell.
 */
export function buildSpawnEnv(
  base: NodeJS.ProcessEnv,
  settings: Settings,
  secrets: EnvMap
): EnvMap {
  const env: EnvMap = {}
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) env[key] = value
  }
  // Unbuffered stdout is belt-and-braces with the explicit flush in ipc_main:
  // a buffered pipe would stall the whole event stream until the run ends.
  env.PYTHONUNBUFFERED = '1'
  env.PYTHONIOENCODING = 'utf-8'
  Object.assign(env, buildConfigEnv(settings))
  for (const [key, value] of Object.entries(secrets)) put(env, key, value)
  return env
}

/** Per-run data-vendor overrides, passed as request config rather than env. */
export function buildRunConfig(settings: Settings): Record<string, unknown> {
  return { data_vendors: { ...settings.dataVendors } }
}
