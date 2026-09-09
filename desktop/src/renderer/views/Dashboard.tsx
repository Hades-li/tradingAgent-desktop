/**
 * Three-column run dashboard: pipeline | event stream | reports, with draggable
 * dividers. `react-resizable-panels` brings the constraints, keyboard support
 * and width persistence, so none of that is hand-rolled here.
 */

import { useEffect, useMemo, useState } from 'react'
import { FileText, GitBranch, Square, Terminal } from 'lucide-react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { SIGNAL_LABELS, agentLabel } from '@shared/labels'
import { SECTION_KEYS, type SectionKey } from '@shared/protocol'
import { EventStream } from '@renderer/components/EventStream'
import { Pipeline } from '@renderer/components/Pipeline'
import { ReportTabs } from '@renderer/components/ReportTabs'
import { completedSectionCount, expectedSections, useRunStore } from '@renderer/store/runStore'

const ANALYST_AGENT: Record<string, string> = {
  market: 'Market Analyst',
  social: 'Sentiment Analyst',
  news: 'News Analyst',
  fundamentals: 'Fundamentals Analyst'
}

function elapsed(from: number | null, to: number | null): string {
  if (!from) return '00:00'
  const seconds = Math.max(0, Math.floor(((to ?? Date.now()) - from) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

const STATE_LABEL: Record<string, string> = {
  idle: '待启动',
  running: '运行中',
  finished: '已完成',
  failed: '已失败',
  cancelled: '已取消'
}

export function Dashboard(): React.JSX.Element {
  const run = useRunStore()
  const [, forceTick] = useState(0)
  // Column widths survive restarts; localStorage is enough for a single user.
  const layout = useDefaultLayout({
    id: 'ta-dashboard',
    panelIds: ['pipeline', 'stream', 'reports'],
    storage: localStorage
  })

  // One cheap repaint per second keeps the elapsed clock honest without
  // pushing a timer value through the store on every tick.
  useEffect(() => {
    if (run.status !== 'running') return
    const timer = setInterval(() => forceTick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [run.status])

  const available = useMemo(() => expectedSections(run.analysts), [run.analysts])
  const latest = useMemo(() => lastTouched(run.sections, available), [run.sections, available])
  const done = completedSectionCount(run.sections, run.agentStatus, run.analysts)
  const analystAgents = run.analysts.map((key) => ANALYST_AGENT[key])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <div className="flex items-center gap-2">
          <strong className="text-[15px]">{run.ticker || '—'}</strong>
          <span className="text-muted">
            {run.date} · {run.assetType === 'crypto' ? '加密货币管线' : '股票管线'}
          </span>
          <span
            className={`rounded-full border px-2 py-[1px] text-[11px] ${
              run.status === 'running'
                ? 'border-accent text-accent'
                : run.status === 'finished'
                  ? 'border-ok text-ok'
                  : run.status === 'idle'
                    ? 'border-line text-muted'
                    : 'border-bad text-bad'
            }`}
          >
            {STATE_LABEL[run.status]}
          </span>
          {run.signal && (
            <span
              className={`rounded-md px-2 py-[1px] text-[11px] font-semibold ${
                run.isReview ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent'
              }`}
            >
              {SIGNAL_LABELS[run.signal] ?? run.signal}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-4 text-[12px]">
          <Stat label="已用时" value={elapsed(run.startedAt, run.finishedAt)} />
          <Stat label="工具调用" value={String(run.toolCalls)} />
          <Stat label="报告" value={`${done}/${available.length}`} />
          <Stat label="当前" value={run.currentAgent ? agentLabel(run.currentAgent) : '—'} />
          {run.status === 'running' && run.runId && (
            <button
              type="button"
              onClick={() => void window.desktop.run.cancel(run.runId as string)}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-[3px] text-bad hover:bg-panel2"
            >
              <Square size={12} />
              停止
            </button>
          )}
        </div>
      </header>

      {run.error && (
        <div className="border-b border-line bg-bad/10 px-4 py-1.5 text-[12px] text-bad">
          {run.error}
        </div>
      )}

      <Group
        orientation="horizontal"
        className="flex min-h-0 flex-1"
        {...layout}
      >
        <Panel id="pipeline" defaultSize="20%" minSize="12%" className="bg-panel">
          <ColumnHead icon={<GitBranch size={13} />} title="智能体流水线" />
          <div className="h-[calc(100%-30px)]">
            <Pipeline agentStatus={run.agentStatus} analystAgents={analystAgents} />
          </div>
        </Panel>
        <Handle />
        <Panel id="stream" defaultSize="30%" minSize="16%" className="bg-panel">
          <ColumnHead icon={<Terminal size={13} />} title="事件流" />
          <div className="h-[calc(100%-30px)]">
            <EventStream log={run.log} />
          </div>
        </Panel>
        <Handle />
        {/* Reports keep a hard 300px floor so the Markdown stays readable. */}
        <Panel id="reports" defaultSize="50%" minSize="300px" className="bg-panel">
          <ColumnHead icon={<FileText size={13} />} title="分析结果" />
          <div className="h-[calc(100%-30px)]">
            <ReportTabs sections={run.sections} available={available} latest={latest} />
          </div>
        </Panel>
      </Group>
    </div>
  )
}

function ColumnHead({
  icon,
  title
}: {
  icon: React.ReactNode
  title: string
}): React.JSX.Element {
  return (
    <div className="flex h-[30px] items-center gap-1.5 border-b border-line2 px-3 text-[12px] font-semibold text-muted">
      {icon}
      <span>{title}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

function Handle(): React.JSX.Element {
  // Separator brings the keyboard affordances (role, arrow-key resize) for free.
  return <Separator className="w-px cursor-col-resize bg-line hover:bg-accent" />
}

/** The furthest-along section that has content, in graph order. */
function lastTouched(
  sections: Partial<Record<SectionKey, string>>,
  available: SectionKey[]
): SectionKey | null {
  const ordered = SECTION_KEYS.filter((section) => available.includes(section))
  let latest: SectionKey | null = null
  for (const section of ordered) if (sections[section]) latest = section
  return latest
}
