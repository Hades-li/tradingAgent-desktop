import { Badge } from '@renderer/components/ui/badge'
import { useDomain } from '@renderer/i18n'
import type { AgentStatus } from '@shared/protocol'

const VARIANT: Record<AgentStatus, React.ComponentProps<typeof Badge>['variant']> = {
  pending: 'outline',
  in_progress: 'default',
  completed: 'secondary'
}

export function StatusBadge({ status }: { status: AgentStatus }): React.JSX.Element {
  const domain = useDomain()
  return <Badge variant={VARIANT[status]}>{domain.status(status)}</Badge>
}
