import { Badge } from '@renderer/components/ui/badge'
import { STATUS_LABELS } from '@shared/labels'
import type { AgentStatus } from '@shared/protocol'

const VARIANT: Record<AgentStatus, React.ComponentProps<typeof Badge>['variant']> = {
  pending: 'outline',
  in_progress: 'default',
  completed: 'secondary'
}

export function StatusBadge({ status }: { status: AgentStatus }): React.JSX.Element {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status] ?? status}</Badge>
}
