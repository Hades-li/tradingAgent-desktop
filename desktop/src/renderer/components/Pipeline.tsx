/**
 * Left column: the five teams, driven entirely by `agent_status` events.
 * Agents with no status yet are shown as pending; unselected analysts never
 * appear because the session never emits for them.
 */

import { Briefcase, ChartNoAxesColumn, Shield, TrendingUp, Users } from 'lucide-react'
import { TEAM_LAYOUT, type AgentStatus } from '@shared/protocol'
import { agentLabel, teamLabel } from '@shared/labels'
import { StatusBadge } from './StatusBadge'

const TEAM_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
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
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {Object.entries(TEAM_LAYOUT).map(([team, agents]) => {
        const visible =
          team === 'Analyst Team' ? agents.filter((a) => analystAgents.includes(a)) : agents
        if (visible.length === 0) return null
        const Icon = TEAM_ICON[team] ?? Users
        return (
          <section key={team} className="border-b border-line2 px-3 py-2 last:border-b-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Icon size={13} />
              <span>{teamLabel(team)}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {visible.map((agent) => {
                const status = agentStatus[agent] ?? 'pending'
                return (
                  <li
                    key={agent}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${
                      status === 'in_progress' ? 'bg-panel2' : ''
                    }`}
                  >
                    <span className="truncate text-[12px]">{agentLabel(agent)}</span>
                    <StatusBadge status={status} />
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
