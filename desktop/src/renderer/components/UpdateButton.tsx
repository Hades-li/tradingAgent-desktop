/**
 * Sidebar footer entry for in-app updates. Hidden until the main process has
 * found a newer release; every click just asks main for the next step, and
 * main decides whether that means installing now or waiting for the user.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleAlert, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import type { UpdateState } from '@shared/update'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'

export function UpdateButton(): React.JSX.Element | null {
  const { t } = useTranslation('sidebar')
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })

  useEffect(() => {
    // Subscribe before asking, so a change in between is not lost.
    const off = window.desktop.update.onChange(setState)
    void window.desktop.update.state().then(setState)
    return off
  }, [])

  if (state.phase === 'idle') return null

  const view = (() => {
    switch (state.phase) {
      case 'available':
        return {
          icon: <Download />,
          label: t('update.download'),
          hint: t('update.downloadHint', { version: state.version }),
          onClick: () => void window.desktop.update.download()
        }
      case 'downloading': {
        const percent = state.total > 0 ? Math.min(99, Math.floor((state.received / state.total) * 100)) : 0
        return {
          icon: <LoaderCircle className="animate-spin" />,
          label: `${percent}%`,
          hint: t('update.downloadingHint', { version: state.version })
        }
      }
      case 'ready':
        return {
          icon: <RefreshCw />,
          label: t('update.install'),
          hint: t('update.installHint', { version: state.version }),
          onClick: () => void window.desktop.update.install()
        }
      case 'installing':
        return {
          icon: <LoaderCircle className="animate-spin" />,
          label: t('update.installing'),
          hint: t('update.installingHint', { version: state.version })
        }
      case 'error':
        return {
          icon: <CircleAlert />,
          label: t('update.retry'),
          hint: t('update.retryHint', { message: state.message }),
          onClick: () => void window.desktop.update.download(),
          destructive: true
        }
    }
  })()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={view.destructive ? 'destructive' : 'default'}
            size="xs"
            className="tabular-nums"
            aria-label={view.hint}
            disabled={!view.onClick}
            focusableWhenDisabled
            onClick={view.onClick}
          />
        }
      >
        {view.icon}
        {view.label}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{view.hint}</TooltipContent>
    </Tooltip>
  )
}
