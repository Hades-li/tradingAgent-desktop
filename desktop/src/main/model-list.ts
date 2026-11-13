/**
 * List the models a user-supplied endpoint serves (`GET {baseUrl}/models`).
 *
 * Only providers whose endpoint the user configures are supported: hosted
 * providers ship a curated catalog from Python instead. The key is resolved in
 * main and never crosses into the renderer.
 */

export class ModelListError extends Error {
  constructor(
    readonly reason: 'unsupported' | 'noEndpoint' | 'http' | 'badResponse',
    readonly status?: number
  ) {
    super(status === undefined ? reason : `${reason} ${status}`)
  }
}

/** Key env var per supported provider; null means the server is keyless. */
export const ENDPOINT_KEY_ENV: Record<string, string | null> = {
  ollama: null,
  openai_compatible: 'OPENAI_COMPATIBLE_API_KEY'
}

/** Mirrors the ProviderSpec defaults in tradingagents/llm_clients/openai_client.py. */
function defaultEndpoint(provider: string, env: NodeJS.ProcessEnv): string | null {
  if (provider === 'ollama') return env.OLLAMA_BASE_URL || 'http://localhost:11434/v1'
  return null
}

export function resolveEndpoint(
  provider: string,
  backendUrl: string | null,
  env: NodeJS.ProcessEnv
): string {
  if (!(provider in ENDPOINT_KEY_ENV)) throw new ModelListError('unsupported')
  const endpoint = backendUrl?.trim() || defaultEndpoint(provider, env)
  if (!endpoint) throw new ModelListError('noEndpoint')
  return endpoint
}

export function modelsUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/models`
}

/** OpenAI shape `{data: [{id}]}`, with Ollama's native `{models: [{name}]}` as a fallback. */
export function parseModelIds(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) throw new ModelListError('badResponse')
  const { data, models } = body as { data?: unknown; models?: unknown }
  const entries = Array.isArray(data) ? data : Array.isArray(models) ? models : null
  if (!entries) throw new ModelListError('badResponse')
  const ids = entries
    .map((entry) => {
      if (typeof entry === 'string') return entry
      const { id, name } = (entry ?? {}) as { id?: unknown; name?: unknown }
      return typeof id === 'string' ? id : typeof name === 'string' ? name : ''
    })
    .filter((id) => id.length > 0)
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

export async function listEndpointModels(
  endpoint: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetchImpl(modelsUrl(endpoint), {
    headers,
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new ModelListError('http', response.status)
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ModelListError('badResponse')
  }
  return parseModelIds(body)
}
