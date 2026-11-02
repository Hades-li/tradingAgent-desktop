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
