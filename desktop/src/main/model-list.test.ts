import { describe, expect, it, vi } from 'vitest'
import {
  ModelListError,
  listEndpointModels,
  modelsUrl,
  parseModelIds,
  resolveEndpoint
} from './model-list'

describe('resolveEndpoint', () => {
  it('uses the configured URL for a custom endpoint', () => {
    expect(resolveEndpoint('openai_compatible', ' http://x/v1 ', {})).toBe('http://x/v1')
  })

  it('falls back to the Ollama default', () => {
    expect(resolveEndpoint('ollama', null, {})).toBe('http://localhost:11434/v1')
    expect(resolveEndpoint('ollama', '', { OLLAMA_BASE_URL: 'http://o/v1' })).toBe('http://o/v1')
  })

  it('rejects hosted providers and a missing endpoint', () => {
    expect(() => resolveEndpoint('openai', null, {})).toThrow(ModelListError)
    expect(() => resolveEndpoint('openai_compatible', null, {})).toThrow('noEndpoint')
  })
})

describe('parseModelIds', () => {
  it('reads OpenAI and Ollama shapes, deduplicated and sorted', () => {
    expect(parseModelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b'])
    expect(parseModelIds({ models: [{ name: 'qwen3:latest' }] })).toEqual(['qwen3:latest'])
  })

  it('rejects anything else', () => {
    expect(() => parseModelIds({ error: 'nope' })).toThrow('badResponse')
  })
})

describe('listEndpointModels', () => {
  it('sends the key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: 'gpt-5.6' }] }))
    await expect(listEndpointModels('http://x/v1/', 'sk-1', fetchImpl)).resolves.toEqual(['gpt-5.6'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(modelsUrl('http://x/v1'))
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-1')
  })

  it('surfaces the HTTP status', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    await expect(listEndpointModels('http://x/v1', undefined, fetchImpl)).rejects.toMatchObject({
      reason: 'http',
      status: 401
    })
  })
})
