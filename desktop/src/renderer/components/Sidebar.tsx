import { useEffect, useState } from 'react'
import { Activity, FileText, Key, Plus, Settings as SettingsIcon } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
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
    <aside className="bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r">
      <div className="drag-region h-9" />
      <div className="px-2 pb-2">
        <Button className="no-drag w-full" onClick={() => onNavigate('form')}>
          <Plus />
          新建分析
        </Button>
      </div>

      {run.runId && (
        <>
          <SideLabel>当前运行</SideLabel>
          <div className="px-2">
            <Button
              variant={view === 'dashboard' ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => onNavigate('dashboard')}
            >
              <Activity className={cn(run.status === 'running' && 'text-primary')} />
              <span className="min-w-0 flex-1 truncate text-left">
                {run.ticker}
                <span className="text-muted-foreground"> · {run.date}</span>
              </span>
              <Badge variant={run.status === 'running' ? 'default' : 'secondary'}>
                {run.status === 'running' ? '运行中' : (run.signal ?? '已结束')}
              </Badge>
            </Button>
          </div>
        </>
      )}

      <SideLabel>历史记录</SideLabel>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {entries.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1 text-xs">暂无历史</p>
        ) : (
          entries.slice(0, 40).map((entry) => (
            <Button
              key={entry.id}
              variant="ghost"
              className="w-full justify-start"
              onClick={() => onNavigate('history', entry.id)}
            >
              <FileText className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">
                {entry.ticker}
                <span className="text-muted-foreground"> · {entry.savedAt.slice(11, 16)}</span>
              </span>
            </Button>
          ))
        )}
      </div>

      <Separator />
      <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
        <Key className="size-3.5" />
        <span>{storedKeys} 个密钥</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={view === 'settings' ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="ml-auto"
                aria-label="设置"
                onClick={() => onNavigate('settings')}
              />
            }
          >
            <SettingsIcon />
          </TooltipTrigger>
          <TooltipContent>设置</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  )
}

function SideLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-medium">{children}</div>
  )
}
