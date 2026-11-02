import { describe, expect, it } from 'vitest'
import { parseEngineReply } from './engine-reply'

describe('parseEngineReply', () => {
  it('returns the first JSON line and skips stray output', () => {
    const stdout = 'warning: something\n{"v":1,"type":"options","providers":[]}\n'
    expect(parseEngineReply(stdout)).toEqual({ v: 1, type: 'options', providers: [] })
  })

  it('returns null when the engine printed no JSON', () => {
    expect(parseEngineReply('Traceback ...\n')).toBeNull()
  })

  it('throws the engine message for an error event', () => {
    const stdout = '{"v":1,"type":"error","message":"unsupported request protocol version: 2","recoverable":false}\n'
    expect(() => parseEngineReply(stdout)).toThrow('unsupported request protocol version: 2')
  })
})
