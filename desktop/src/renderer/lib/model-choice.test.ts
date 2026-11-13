import { describe, expect, it } from 'vitest'
import type { ProviderOption } from '@shared/protocol'
import { modelChoices, modelsForProvider } from './model-choice'

const anthropic: ProviderOption = {
  id: 'anthropic',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  supportsCustomEndpoint: false,
  quickModels: [
    { label: 'Claude Sonnet 5 - Best balance', value: 'claude-sonnet-5' },
    { label: 'Custom model ID', value: 'custom' }
  ],
  deepModels: [
    { label: 'Claude Opus 5.5 - Frontier work', value: 'claude-opus-5-5' },
    { label: 'Claude Sonnet 5 - Best balance', value: 'claude-sonnet-5' }
  ]
}

const generic: ProviderOption = {
  id: 'openai_compatible',
  apiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY',
  supportsCustomEndpoint: true,
  quickModels: [{ label: 'Custom model ID', value: 'custom' }],
  deepModels: [{ label: 'Custom model ID', value: 'custom' }]
}

describe('modelChoices', () => {
  it('drops the custom marker and merges endpoint models without duplicates', () => {
    const choices = modelChoices(anthropic.quickModels, ['claude-sonnet-5', 'extra'])
    expect(choices).toEqual([
      { value: 'claude-sonnet-5', hint: 'Best balance', source: 'catalog' },
      { value: 'extra', hint: null, source: 'endpoint' }
    ])
  })
})

describe('modelsForProvider', () => {
  it('replaces models the new provider does not list', () => {
    expect(
      modelsForProvider(anthropic, { deepThinkLlm: 'gpt-5.6', quickThinkLlm: 'gpt-5.6-luna' })
    ).toEqual({ deepThinkLlm: 'claude-opus-5-5', quickThinkLlm: 'claude-sonnet-5' })
  })

  it('keeps models the new provider lists', () => {
    const current = { deepThinkLlm: 'claude-sonnet-5', quickThinkLlm: 'claude-sonnet-5' }
    expect(modelsForProvider(anthropic, current)).toEqual(current)
  })

  it('keeps typed names for providers without a catalog', () => {
    const current = { deepThinkLlm: 'gpt-5.6', quickThinkLlm: 'gpt-5.6-luna' }
    expect(modelsForProvider(generic, current)).toEqual(current)
  })
})
