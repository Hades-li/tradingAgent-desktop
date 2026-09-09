import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'
import { buildConfigEnv, buildSpawnEnv } from './env-builder'

const base: Settings = { ...DEFAULT_SETTINGS }

describe('buildConfigEnv', () => {
  it('maps settings onto TRADINGAGENTS_* names', () => {
    const env = buildConfigEnv({ ...base, llmProvider: 'anthropic', maxDebateRounds: 3 })
    expect(env.TRADINGAGENTS_LLM_PROVIDER).toBe('anthropic')
    expect(env.TRADINGAGENTS_MAX_DEBATE_ROUNDS).toBe('3')
  })

  it('omits unset values so Python keeps its own defaults', () => {
    // An empty string would be coerced by default_config._coerce and can throw.
    const env = buildConfigEnv({ ...base, benchmarkTicker: null, maxTokens: null })
    expect('TRADINGAGENTS_BENCHMARK_TICKER' in env).toBe(false)
    expect('TRADINGAGENTS_MAX_TOKENS' in env).toBe(false)
  })

  it('distinguishes temperature 0 from "follow the default"', () => {
    expect(buildConfigEnv({ ...base, temperature: 0 }).TRADINGAGENTS_TEMPERATURE).toBe('0')
    expect('TRADINGAGENTS_TEMPERATURE' in buildConfigEnv({ ...base, temperature: null })).toBe(
      false
    )
  })

  it('sends a backend URL only for providers that take one', () => {
    const hosted = buildConfigEnv({ ...base, llmProvider: 'openai', backendUrl: 'http://x/v1' })
    expect('TRADINGAGENTS_LLM_BACKEND_URL' in hosted).toBe(false)
    const local = buildConfigEnv({ ...base, llmProvider: 'ollama', backendUrl: 'http://x/v1' })
    expect(local.TRADINGAGENTS_LLM_BACKEND_URL).toBe('http://x/v1')
  })

  it('always sends an explicit boolean for checkpointing', () => {
    expect(buildConfigEnv({ ...base, checkpointEnabled: false }).TRADINGAGENTS_CHECKPOINT_ENABLED)
      .toBe('false')
  })
})

describe('buildSpawnEnv', () => {
  it('forces unbuffered stdout so events stream in real time', () => {
    const env = buildSpawnEnv({ PATH: '/usr/bin' }, base, {})
    expect(env.PYTHONUNBUFFERED).toBe('1')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('lets a stored key beat one inherited from the shell', () => {
    const env = buildSpawnEnv({ OPENAI_API_KEY: 'from-shell' }, base, {
      OPENAI_API_KEY: 'from-keychain'
    })
    expect(env.OPENAI_API_KEY).toBe('from-keychain')
  })

  it('ignores empty secrets rather than blanking an inherited key', () => {
    const env = buildSpawnEnv({ OPENAI_API_KEY: 'from-shell' }, base, { OPENAI_API_KEY: '' })
    expect(env.OPENAI_API_KEY).toBe('from-shell')
  })
})
