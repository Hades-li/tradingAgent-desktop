/**
 * Live run state, rebuilt purely from protocol events.
 *
 * The Python side already decided every status transition, so the store never
 * infers progress on its own — it only records what arrived.
 */

import { create } from 'zustand'
import {
  SECTION_ANALYST,
  SECTION_FINALIZER,
  SECTION_KEYS,
  type AgentStatus,
  type AnalystKey,
  type AssetType,
  type RunEvent,
  type SectionKey
} from '@shared/protocol'

export type LogKind = 'tool' | 'msg' | 'sys'

export interface LogEntry {
  id: number
  at: number
  kind: LogKind
  label: string
  text: string
}

export type RunStatus = 'idle' | 'running' | 'finished' | 'failed' | 'cancelled'

interface RunState {
  runId: string | null
  ticker: string
  date: string
  assetType: AssetType
  analysts: AnalystKey[]
  status: RunStatus
  startedAt: number | null
  finishedAt: number | null
  agentStatus: Record<string, AgentStatus>
  currentAgent: string | null
  sections: Partial<Record<SectionKey, string>>
  log: LogEntry[]
  toolCalls: number
  signal: string | null
  isReview: boolean
  reportPath: string | null
  error: string | null
  begin: (input: {
    runId: string
    ticker: string
    date: string
    analysts: AnalystKey[]
    assetType: AssetType
  }) => void
  apply: (event: RunEvent) => void
  fail: (message: string) => void
  reset: () => void
}

/** Cap the log so a long run cannot grow the renderer heap without bound. */
const MAX_LOG = 4000
let sequence = 0

function truncate(entries: LogEntry[]): LogEntry[] {
  return entries.length > MAX_LOG ? entries.slice(entries.length - MAX_LOG) : entries
}

function push(entries: LogEntry[], kind: LogKind, label: string, text: string): LogEntry[] {
  return truncate([...entries, { id: sequence++, at: Date.now(), kind, label, text }])
}

const initial = {
  runId: null,
  ticker: '',
  date: '',
  assetType: 'stock' as AssetType,
  analysts: [] as AnalystKey[],
  status: 'idle' as RunStatus,
  startedAt: null,
  finishedAt: null,
  agentStatus: {} as Record<string, AgentStatus>,
  currentAgent: null,
  sections: {} as Partial<Record<SectionKey, string>>,
  log: [] as LogEntry[],
  toolCalls: 0,
  signal: null,
  isReview: false,
  reportPath: null,
  error: null
}

export const useRunStore = create<RunState>((set) => ({
  ...initial,

  begin: ({ runId, ticker, date, analysts, assetType }) =>
    set({
      ...initial,
      runId,
      ticker,
      date,
      analysts,
      assetType,
      status: 'running',
      startedAt: Date.now(),
      log: push([], 'sys', '系统', `已启动 ${ticker} · ${date}`)
    }),

  apply: (event) =>
    set((state) => {
      switch (event.type) {
        case 'run_started':
          return {
            runId: event.runId,
            ticker: event.ticker,
            date: event.date,
            assetType: event.assetType,
            analysts: event.analysts,
            status: 'running',
            startedAt: state.startedAt ?? Date.now()
          }
        case 'agent_status':
          return {
            agentStatus: { ...state.agentStatus, [event.agent]: event.status },
            currentAgent: event.status === 'in_progress' ? event.agent : state.currentAgent
          }
        case 'report_section':
          // Full replacement, never append (PROTOCOL.md).
          return { sections: { ...state.sections, [event.section]: event.content } }
        case 'tool_call':
          return {
            toolCalls: state.toolCalls + 1,
            log: push(state.log, 'tool', event.name, formatArgs(event.args))
          }
        case 'message':
          return {
            log: push(
              state.log,
              event.role === 'System' ? 'sys' : 'msg',
              event.role,
              event.content
            )
          }
        case 'run_finished':
          return {
            status: 'finished',
            finishedAt: Date.now(),
            signal: event.signal,
            isReview: event.isReview,
            reportPath: event.reportPath ?? null,
            currentAgent: null,
            log: push(state.log, 'sys', '系统', `分析完成 · ${event.signal ?? '无评级'}`)
          }
        case 'error':
          return {
            status: event.code === 'cancelled' ? 'cancelled' : 'failed',
            finishedAt: Date.now(),
            error: event.message,
            currentAgent: null,
            log: push(state.log, 'sys', '错误', event.message)
          }
        default:
          return {}
      }
    }),

  fail: (message) =>
    set((state) => ({
      status: 'failed',
      error: message,
      finishedAt: Date.now(),
      log: push(state.log, 'sys', '错误', message)
    })),

  reset: () => set({ ...initial })
}))

function formatArgs(args: unknown): string {
  if (args === null || args === undefined) return ''
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args)
  } catch {
    return String(args)
  }
}

/** Sections that this run will produce, given the analyst selection. */
export function expectedSections(analysts: AnalystKey[]): SectionKey[] {
  return SECTION_KEYS.filter((section) => {
    const gate = SECTION_ANALYST[section]
    return gate === null || analysts.includes(gate)
  })
}

/**
 * A section counts as done only once its finalizing agent completes — debate
 * rounds keep rewriting the same section long before it is final.
 */
export function completedSectionCount(
  sections: Partial<Record<SectionKey, string>>,
  agentStatus: Record<string, AgentStatus>,
  analysts: AnalystKey[]
): number {
  return expectedSections(analysts).filter(
    (section) =>
      Boolean(sections[section]) && agentStatus[SECTION_FINALIZER[section]] === 'completed'
  ).length
}
