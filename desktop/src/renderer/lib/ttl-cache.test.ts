import { describe, expect, it } from 'vitest'
import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  it('serves a value until it expires', () => {
    let clock = 0
    const cache = new TtlCache<string, number>(1000, () => clock)
    cache.set('us', 1)
    clock = 999
    expect(cache.get('us')).toBe(1)
    clock = 1000
    expect(cache.get('us')).toBeUndefined()
  })
})
