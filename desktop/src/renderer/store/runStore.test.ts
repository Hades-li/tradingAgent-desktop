import { beforeEach, describe, expect, it } from 'vitest'
import type { RunEvent } from '@shared/protocol'
import { completedSectionCount, expectedSections, useRunStore } from './runStore'

function apply(...events: RunEvent[]): void {
  for (const event of events) useRunStore.getState().apply(event)
}

describe('runStore', () => {
  beforeEach(() => {
    useRunStore.getState().reset()
    useRunStore.getState().begin({
      runId: 'run-1',
      ticker: 'NVDA',
      date: '2026-01-02',
      analysts: ['market', 'news'],
      assetType: 'stock'
    })
  })

  it('tracks agent status and the current agent', () => {
    apply({ v: 1, type: 'agent_status', agent: 'Market Analyst', status: 'in_progress' })
    expect(useRunStore.getState().currentAgent).toBe('Market Analyst')
    apply({ v: 1, type: 'agent_status', agent: 'Market Analyst', status: 'completed' })
    expect(useRunStore.getState().agentStatus['Market Analyst']).toBe('completed')
  })

  it('replaces section content rather than appending it', () => {
    apply(
      { v: 1, type: 'report_section', section: 'investment_plan', content: 'bull' },
      { v: 1, type: 'report_section', section: 'investment_plan', content: 'judge' }
    )
    expect(useRunStore.getState().sections.investment_plan).toBe('judge')
  })

  it('splits the log into tool / message / system streams', () => {
    apply(
      { v: 1, type: 'tool_call', name: 'get_stock_data', args: { days: 5 } },
      { v: 1, type: 'message', role: 'Agent', content: 'thinking' },
      { v: 1, type: 'message', role: 'System', content: 'done' }
    )
    const kinds = useRunStore.getState().log.map((entry) => entry.kind)
    expect(kinds).toEqual(['sys', 'tool', 'msg', 'sys'])
    expect(useRunStore.getState().toolCalls).toBe(1)
  })

  it('logs store-originated lines as translation keys, not fixed-language text', () => {
    apply({ v: 1, type: 'run_finished', runId: 'run-1', signal: 'Underweight', isReview: false })
    const [started, finished] = useRunStore.getState().log
    expect(started).toMatchObject({
      textKey: 'log.started',
      params: { ticker: 'NVDA', date: '2026-01-02' }
    })
    expect(finished).toMatchObject({ textKey: 'log.finished', params: { rating: 'Underweight' } })
  })

  it('records the signal and review flag without interpreting the string', () => {
    apply({ v: 1, type: 'run_finished', runId: 'run-1', signal: 'REVIEW', isReview: true })
    const state = useRunStore.getState()
    expect(state.status).toBe('finished')
    expect(state.isReview).toBe(true)
  })

  it('distinguishes a cancelled run from a failed one', () => {
    apply({ v: 1, type: 'error', message: 'run cancelled', recoverable: true, code: 'cancelled' })
    expect(useRunStore.getState().status).toBe('cancelled')
    useRunStore.getState().reset()
    apply({ v: 1, type: 'error', message: 'boom', recoverable: false })
    expect(useRunStore.getState().status).toBe('failed')
  })
})

describe('section helpers', () => {
  it('only expects sections the selected analysts produce', () => {
    expect(expectedSections(['market'])).toEqual([
      'market_report',
      'investment_plan',
      'trader_investment_plan',
      'final_trade_decision'
    ])
  })

  it('counts a section done only once its finalizing agent completes', () => {
    const sections = { market_report: '# MKT' }
    expect(completedSectionCount(sections, {}, ['market'])).toBe(0)
    expect(
      completedSectionCount(sections, { 'Market Analyst': 'completed' }, ['market'])
    ).toBe(1)
  })
})
