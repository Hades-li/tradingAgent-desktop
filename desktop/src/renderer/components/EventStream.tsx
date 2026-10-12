/**
 * Middle column. On a real run tool calls vastly outnumber agent prose, so the
 * filter row is load-bearing rather than decorative.
 *
 * The log keeps a native scroll container rather than ScrollArea: auto-follow
 * needs to read scrollTop off the element it attaches to, and ScrollArea owns
 * its viewport node internally.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { cn } from '@renderer/lib/utils'
import type { LogEntry, LogKind } from '@renderer/store/runStore'

type Filter = 'all' | LogKind

const FILTERS: Filter[] = ['all', 'tool', 'msg', 'sys']

const KIND_TONE: Record<LogKind, string> = {
  tool: 'text-primary',
  msg: 'text-foreground',
  sys: 'text-muted-foreground'
}

function timeOf(at: number, language: string): string {
  return new Date(at).toLocaleTimeString(language, { hour12: false })
}

export function EventStream({ log }: { log: LogEntry[] }): React.JSX.Element {
  const { t, i18n } = useTranslation('dashboard')
  const [filter, setFilter] = useState<Filter>('all')
  const bottom = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)

  const visible = useMemo(
    () => (filter === 'all' ? log : log.filter((entry) => entry.kind === filter)),
    [log, filter]
  )

  useEffect(() => {
    if (follow) bottom.current?.scrollIntoView({ block: 'end' })
  }, [visible.length, follow])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <ToggleGroup
          value={[filter]}
          onValueChange={(value) => setFilter((value[0] as Filter) ?? 'all')}
          size="sm"
        >
          {FILTERS.map((item) => (
            <ToggleGroupItem key={item} value={item}>
              {t(`stream.${item}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Badge variant="secondary" className="ml-auto">
          {t('stream.count', { count: visible.length })}
        </Badge>
      </div>
      <div
        className="flex-1 overflow-y-auto px-2 py-1.5"
        onScroll={(event) => {
          const element = event.currentTarget
          // Auto-follow only while the user is parked at the bottom.
          setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 24)
        }}
      >
        {visible.map((entry) => (
          <div key={entry.id} className="mb-1 flex gap-2 text-sm leading-relaxed">
            <span className="text-muted-foreground shrink-0 font-mono text-xs">
              {timeOf(entry.at, i18n.language)}
            </span>
            <span className={cn('shrink-0 font-medium', KIND_TONE[entry.kind])}>
              {entry.labelKey ? t(entry.labelKey) : entry.label}
            </span>
            <span className="min-w-0 break-words whitespace-pre-wrap">
              {entry.textKey ? String(t(entry.textKey, (entry.params ?? {}) as never)) : entry.text}
            </span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  )
}
