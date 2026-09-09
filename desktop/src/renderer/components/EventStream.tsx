/**
 * Middle column. On a real run tool calls vastly outnumber agent prose, so the
 * filter row is load-bearing rather than decorative.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry, LogKind } from '@renderer/store/runStore'

const FILTERS: { id: 'all' | LogKind; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tool', label: '工具' },
  { id: 'msg', label: '消息' },
  { id: 'sys', label: '系统' }
]

const KIND_TONE: Record<LogKind, string> = {
  tool: 'text-accent',
  msg: 'text-ink',
  sys: 'text-muted'
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour12: false })
}

export function EventStream({ log }: { log: LogEntry[] }): React.JSX.Element {
  const [filter, setFilter] = useState<'all' | LogKind>('all')
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
      <div className="flex flex-wrap gap-1 border-b border-line2 px-2 py-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-md px-2 py-[2px] text-[11px] ${
              filter === item.id ? 'bg-accent text-white' : 'text-muted hover:bg-panel2'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted">{visible.length} 条</span>
      </div>
      <div
        className="flex-1 overflow-y-auto px-2 py-1.5"
        onScroll={(event) => {
          const element = event.currentTarget
          // Auto-follow only while the user is parked at the bottom.
          const atBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 24
          setFollow(atBottom)
        }}
      >
        {visible.map((entry) => (
          <div key={entry.id} className="mb-1 flex gap-2 text-[12px] leading-[1.5]">
            <span className="shrink-0 font-mono text-[11px] text-muted">{timeOf(entry.at)}</span>
            <span className={`shrink-0 font-medium ${KIND_TONE[entry.kind]}`}>{entry.label}</span>
            <span className="min-w-0 break-words whitespace-pre-wrap text-ink/90">
              {entry.text}
            </span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  )
}
