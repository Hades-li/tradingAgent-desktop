/**
 * Left column: the five teams, driven entirely by `agent_status` events.
 * Agents with no status yet are shown as pending; unselected analysts never
 * appear because the session never emits for them.
 */

import { Briefcase, ChartNoAxesColumn, Shield, TrendingUp, Users } from 'lucide-react'
import { StatusBadge } from '@renderer/components/StatusBadge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import { agentLabel, teamLabel } from '@shared/labels'
import { TEAM_LAYOUT, type AgentStatus } from '@shared/protocol'
import { cn } from '@renderer/lib/utils'

const TEAM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  'Analyst Team': ChartNoAxesColumn,
  'Research Team': Users,
  'Trading Team': TrendingUp,
  'Risk Management': Shield,
  'Portfolio Management': Briefcase
}

interface Props {
  agentStatus: Record<string, AgentStatus>
  analystAgents: string[]
}

export function Pipeline({ agentStatus, analystAgents }: Props): React.JSX.Element {
  const teams = Object.entries(TEAM_LAYOUT)
    .map(([team, agents]) => ({
      team,
      agents: team === 'Analyst Team' ? agents.filter((a) => analystAgents.includes(a)) : agents
    }))
    .filter(({ agents }) => agents.length > 0)

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {teams.map(({ team, agents }, index) => {
          const Icon = TEAM_ICON[team] ?? Users
          return (
            <section key={team} className="flex flex-col gap-1">
              {index > 0 && <Separator className="my-1" />}
              <div className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs font-medium">
                <Icon className="size-3.5" />
                <span>{teamLabel(team)}</span>
              </div>
              {agents.map((agent) => {
                const status = agentStatus[agent] ?? 'pending'
                return (
                  <div
                    key={agent}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2 py-1',
                      status === 'in_progress' && 'bg-accent'
                    )}
                  >
                    <span className="truncate text-sm">{agentLabel(agent)}</span>
                    <StatusBadge status={status} />
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </ScrollArea>
  )
}
