import type { AgentStatus } from '@shared/protocol'
import { STATUS_LABELS } from '@shared/labels'

const TONE: Record<AgentStatus, string> = {
  pending: 'text-muted border-line',
  in_progress: 'text-accent border-accent',
  completed: 'text-ok border-ok'
}

export function StatusBadge({ status }: { status: AgentStatus }): React.JSX.Element {
  return (
    <span
      className={`rounded-full border px-2 py-[1px] text-[11px] leading-4 ${TONE[status]}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
