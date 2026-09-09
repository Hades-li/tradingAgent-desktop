import { describe, expect, it } from 'vitest'
import {
  PROTOCOL_VERSION,
  SECTION_ANALYST,
  SECTION_FINALIZER,
  SECTION_KEYS,
  isSectionKey,
  isSupportedEvent
} from './protocol'

describe('isSupportedEvent', () => {
  it('accepts an event of the current version', () => {
    expect(isSupportedEvent({ v: PROTOCOL_VERSION, type: 'message' })).toBe(true)
  })

  it('rejects a future protocol version instead of guessing', () => {
    expect(isSupportedEvent({ v: 2, type: 'message' })).toBe(false)
  })

  it('rejects non-objects and untyped payloads', () => {
    expect(isSupportedEvent(null)).toBe(false)
    expect(isSupportedEvent('run_started')).toBe(false)
    expect(isSupportedEvent({ v: 1 })).toBe(false)
  })
})

describe('section tables', () => {
  it('covers every section key exactly once', () => {
    expect(Object.keys(SECTION_FINALIZER).sort()).toEqual([...SECTION_KEYS].sort())
    expect(Object.keys(SECTION_ANALYST).sort()).toEqual([...SECTION_KEYS].sort())
  })

  it('recognises only real section keys', () => {
    expect(isSectionKey('market_report')).toBe(true)
    expect(isSectionKey('astrology_report')).toBe(false)
  })
})
