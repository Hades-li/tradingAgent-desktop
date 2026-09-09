import { useEffect, useState } from 'react'
import { Activity, FileText, Key, Plus, Settings as SettingsIcon } from 'lucide-react'
import { SIGNAL_LABELS } from '@shared/labels'
import { useRunStore } from '@renderer/store/runStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

interface HistoryEntry {
  id: string
  ticker: string
  savedAt: string
  path: string
}

export type View = 'form' | 'dashboard' | 'settings' | 'history'

interface Props {
  view: View
  onNavigate: (view: View, historyId?: string) => void
  historyVersion: number
}

export function Sidebar({ view, onNavigate, historyVersion }: Props): React.JSX.Element {
  const run = useRunStore()
  const keyStatus = useSettingsStore((state) => state.keyStatus)
  const [entries, setEntries] = useState<HistoryEntry[]>([])

  // Re-read after every finished run so a fresh report shows up immediately.
  useEffect(() => {
    void window.desktop.history.list().then(setEntries)
  }, [historyVersion])

  const storedKeys = Object.values(keyStatus).filter((state) => state === 'stored').length

  return (
    <aside className="flex w-[212px] shrink-0 flex-col border-r border-line bg-panel2">
      <div className="drag-region h-9" />
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => onNavigate('form')}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-white"
        >
          <Plus size={13} />
          新建分析
        </button>
      </div>

      {run.runId && (
        <>
          <SideLabel>当前运行</SideLabel>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={`mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${
              view === 'dashboard' ? 'bg-panel' : 'hover:bg-panel'
            }`}
          >
            <Activity size={13} className={run.status === 'running' ? 'text-accent' : ''} />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {run.ticker}
              <span className="text-muted"> · {run.date}</span>
            </span>
            <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] text-muted">
              {run.status === 'running' ? '运行中' : run.signal ?? '已结束'}
            </span>
          </button>
        </>
      )}

      <SideLabel>历史记录</SideLabel>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {entries.slice(0, 40).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onNavigate('history', entry.id)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-panel"
          >
            <FileText size={13} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {entry.ticker}
              <span className="text-muted"> · {entry.savedAt.slice(11, 16)}</span>
            </span>
          </button>
        ))}
        {entries.length === 0 && (
          <p className="px-2 py-1 text-[11px] text-muted">暂无历史</p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[11px] text-muted">
        <Key size={12} />
        <span>{storedKeys} 个密钥</span>
        <button
          type="button"
          aria-label="设置"
          onClick={() => onNavigate('settings')}
          className={`ml-auto rounded-md p-1 hover:bg-panel ${
            view === 'settings' ? 'text-accent' : ''
          }`}
        >
          <SettingsIcon size={14} />
        </button>
      </div>
    </aside>
  )
}

function SideLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted">{children}</div>
}

export { SIGNAL_LABELS }
