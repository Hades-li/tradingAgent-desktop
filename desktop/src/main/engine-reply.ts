/**
 * One-shot sidecar commands answer with a single JSON line on stdout. An
 * `error` event (for example an unknown market) becomes a thrown Error so the
 * renderer sees the engine's own message instead of a bare exit code.
 */

export function parseEngineReply(stdout: string): Record<string, unknown> | null {
  const line = stdout.split('\n').find((candidate) => candidate.trim().startsWith('{'))
  if (!line) return null
  const reply = JSON.parse(line) as Record<string, unknown>
  if (reply.type === 'error') throw new Error(String(reply.message))
  return reply
}

/** Remembers values for `ttlMs`; `now` is injectable so tests need no timers. */
export class TtlCache<Key, Value> {
  private readonly entries = new Map<Key, { storedAt: number; value: Value }>()

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now
  ) {}

  get(key: Key): Value | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: Key, value: Value): void {
    this.entries.set(key, { storedAt: this.now(), value })
  }
}
