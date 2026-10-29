import { describe, expect, it } from 'vitest'
import { parseEngineReply, TtlCache } from './engine-reply'

describe('parseEngineReply', () => {
  it('returns the first JSON line and skips stray output', () => {
    const stdout = 'warning: something\n{"v":1,"type":"market_list","items":[]}\n'
    expect(parseEngineReply(stdout)).toEqual({ v: 1, type: 'market_list', items: [] })
  })

  it('returns null when the engine printed no JSON', () => {
    expect(parseEngineReply('Traceback ...\n')).toBeNull()
  })

  it('throws the engine message for an error event', () => {
    const stdout = '{"v":1,"type":"error","message":"unknown market \'eu\'","recoverable":false}\n'
    expect(() => parseEngineReply(stdout)).toThrow("unknown market 'eu'")
  })
})

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
