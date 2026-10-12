/**
 * Three-column run dashboard: pipeline | event stream | reports, with draggable
 * dividers. The resizable primitives come from the registry, which wraps
 * react-resizable-panels — constraints, keyboard support and width persistence
 * are not hand-rolled here.
 */

import { useEffect, useMemo, useState } from 'react'
import { FileText, GitBranch, Square, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDefaultLayout } from 'react-resizable-panels'
import { EventStream } from '@renderer/components/EventStream'
import { Pipeline } from '@renderer/components/Pipeline'
import { ReportTabs } from '@renderer/components/ReportTabs'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@renderer/components/ui/resizable'
import {
  completedSectionCount,
  expectedSections,
  useRunStore,
  type RunStatus
} from '@renderer/store/runStore'
import { useDomain } from '@renderer/i18n'
import { SECTION_KEYS, type SectionKey } from '@shared/protocol'

const ANALYST_AGENT: Record<string, string> = {
  market: 'Market Analyst',
  social: 'Sentiment Analyst',
  news: 'News Analyst',
  fundamentals: 'Fundamentals Analyst'
}

const STATE_VARIANT: Record<RunStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  idle: 'outline',
  running: 'default',
  finished: 'secondary',
  failed: 'destructive',
  cancelled: 'destructive'
}

function elapsed(from: number | null, to: number | null): string {
  if (!from) return '00:00'
  const seconds = Math.max(0, Math.floor(((to ?? Date.now()) - from) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function Dashboard(): React.JSX.Element {
  const { t } = useTranslation('dashboard')
  const domain = useDomain()
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
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <strong>{run.ticker || '—'}</strong>
          <span className="text-muted-foreground text-sm">
            {run.date} · {t(run.assetType === 'crypto' ? 'pipeline.crypto' : 'pipeline.stock')}
          </span>
          <Badge variant={STATE_VARIANT[run.status]}>{t(`state.${run.status}`)}</Badge>
          {run.signal && (
            <Badge variant={run.isReview ? 'destructive' : 'default'}>
              {domain.ratingShort(run.signal)}
            </Badge>
          )}
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <Stat label={t('stat.elapsed')} value={elapsed(run.startedAt, run.finishedAt)} />
          <Stat label={t('stat.toolCalls')} value={String(run.toolCalls)} />
          <Stat label={t('stat.reports')} value={`${done}/${available.length}`} />
          <Stat label={t('stat.current')} value={run.currentAgent ? domain.agent(run.currentAgent) : '—'} />
          {run.status === 'running' && run.runId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void window.desktop.run.cancel(run.runId as string)}
            >
              <Square />
              {t('stop')}
            </Button>
          )}
        </div>
      </header>

      {run.error && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      )}

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1" {...layout}>
        <ResizablePanel id="pipeline" defaultSize="20%" minSize="12%">
          <ColumnHead icon={<GitBranch className="size-3.5" />} title={t('column.pipeline')} />
          <div className="h-[calc(100%---spacing(8))]">
            <Pipeline agentStatus={run.agentStatus} analystAgents={analystAgents} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="stream" defaultSize="30%" minSize="16%">
          <ColumnHead icon={<Terminal className="size-3.5" />} title={t('column.stream')} />
          <div className="h-[calc(100%---spacing(8))]">
            <EventStream log={run.log} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        {/* Reports keep a hard 300px floor so the Markdown stays readable. */}
        <ResizablePanel id="reports" defaultSize="50%" minSize="300px">
          <ColumnHead icon={<FileText className="size-3.5" />} title={t('column.results')} />
          <div className="h-[calc(100%---spacing(8))]">
            <ReportTabs sections={run.sections} available={available} latest={latest} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
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
    <div className="text-muted-foreground flex h-8 items-center gap-1.5 border-b px-3 text-xs font-medium">
      {icon}
      <span>{title}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
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
