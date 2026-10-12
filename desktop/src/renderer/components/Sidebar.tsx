import { useEffect, useState } from 'react'
import { Activity, ChevronRight, FileText, Key, Plus, Settings as SettingsIcon } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@renderer/components/ui/collapsible'
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator
} from '@renderer/components/ui/sidebar'
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
    <SidebarProvider
      className="h-full min-h-0 w-auto shrink-0"
      style={{ '--sidebar-width': '14rem' } as React.CSSProperties}
    >
      <SidebarRoot collapsible="none" className="border-r">
        <SidebarHeader className="gap-0 p-0">
          <div className="drag-region h-9" />
          <div className="px-2 pb-2">
            <Button className="no-drag w-full" onClick={() => onNavigate('form')}>
              <Plus />
              新建分析
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {run.runId && (
            <CollapsibleGroup title="当前运行">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === 'dashboard'}
                  onClick={() => onNavigate('dashboard')}
                >
                  <Activity className={cn(run.status === 'running' && 'text-primary')} />
                  <span className="min-w-0 flex-1 truncate">
                    {run.ticker}
                    <span className="text-muted-foreground"> · {run.date}</span>
                  </span>
                  <Badge variant={run.status === 'running' ? 'default' : 'secondary'}>
                    {run.status === 'running' ? '运行中' : (run.signal ?? '已结束')}
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </CollapsibleGroup>
          )}

          <CollapsibleGroup title="历史记录">
            {entries.length === 0 ? (
              <SidebarMenuItem>
                <p className="text-muted-foreground px-2 py-1 text-xs">暂无历史</p>
              </SidebarMenuItem>
            ) : (
              entries.slice(0, 40).map((entry) => (
                <SidebarMenuItem key={entry.id}>
                  <SidebarMenuButton onClick={() => onNavigate('history', entry.id)}>
                    <FileText className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.ticker}
                      <span className="text-muted-foreground"> · {entry.savedAt.slice(11, 16)}</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </CollapsibleGroup>
        </SidebarContent>

        <SidebarSeparator className="mx-0" />
        <SidebarFooter className="text-muted-foreground flex-row items-center gap-2 px-3 py-2 text-xs">
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
        </SidebarFooter>
      </SidebarRoot>
    </SidebarProvider>
  )
}

function CollapsibleGroup({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Collapsible defaultOpen>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel render={<CollapsibleTrigger />} className="w-full cursor-pointer">
          {title}
          <ChevronRight className="ml-auto transition-transform in-data-panel-open:rotate-90" />
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
