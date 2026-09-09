/**
 * Saved runs, read straight off the report tree that both clients write.
 */

import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FolderOpen } from 'lucide-react'

interface HistoryEntry {
  id: string
  ticker: string
  savedAt: string
  path: string
}

interface HistoryDetail extends HistoryEntry {
  completeReport: string
}

export function History({ selectedId }: { selectedId: string | null }): React.JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [detail, setDetail] = useState<HistoryDetail | null>(null)

  useEffect(() => {
    void window.desktop.history.list().then(setEntries)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    void window.desktop.history.read(selectedId).then(setDetail)
  }, [selectedId])

  if (!selectedId) {
    return (
      <div className="p-6">
        <h3 className="mb-3 text-[15px] font-semibold">历史记录</h3>
        {entries.length === 0 ? (
          <p className="text-muted">还没有已保存的分析报告。</p>
        ) : (
          <ul className="flex max-w-2xl flex-col gap-1">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
              >
                <strong>{entry.ticker}</strong>
                <span className="text-muted">{entry.savedAt.replace('T', ' ')}</span>
                <button
                  type="button"
                  className="ml-auto flex items-center gap-1 text-[11px] text-muted hover:text-ink"
                  onClick={() => void window.desktop.history.reveal(entry.path)}
                >
                  <FolderOpen size={12} />
                  在访达中显示
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <strong>{detail?.ticker ?? selectedId}</strong>
        <span className="text-muted">{detail?.savedAt.replace('T', ' ')}</span>
        {detail && (
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-[11px] text-muted hover:text-ink"
            onClick={() => void window.desktop.history.reveal(detail.path)}
          >
            <FolderOpen size={12} />
            在访达中显示
          </button>
        )}
      </header>
      <div className="md flex-1 overflow-y-auto px-6 py-4">
        {detail ? (
          <Markdown remarkPlugins={[remarkGfm]}>{detail.completeReport}</Markdown>
        ) : (
          <p className="text-muted">正在读取…</p>
        )}
      </div>
    </div>
  )
}
