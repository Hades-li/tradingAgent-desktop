/**
 * Shell: sidebar + one of four views. All privileged work goes through
 * `window.desktop`, which the preload bridge defines.
 */

import { useCallback, useEffect, useState } from 'react'
import { Sidebar, type View } from '@renderer/components/Sidebar'
import { applyUiLanguage, i18n } from '@renderer/i18n'
import { Dashboard } from '@renderer/views/Dashboard'
import { History } from '@renderer/views/History'
import { NewAnalysis } from '@renderer/views/NewAnalysis'
import { SettingsView } from '@renderer/views/Settings'
import { useRunStore } from '@renderer/store/runStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

export function App(): React.JSX.Element {
  const [view, setView] = useState<View>('form')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const loadSettings = useSettingsStore((state) => state.load)
  const settings = useSettingsStore((state) => state.settings)
  // Settings arrive asynchronously; the form seeds its local state from them at
  // mount, so it must remount once they land or a cold start silently shows
  // defaults instead of what the user saved.
  const settingsLoaded = useSettingsStore((state) => state.loaded)
  const { apply, begin, fail, status, runId } = useRunStore()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    applyUiLanguage(settings.uiLanguage)
  }, [settings.uiLanguage])

  useEffect(() => {
    const offEvent = window.desktop.run.onEvent(({ event }) => {
      apply(event)
      if (event.type === 'run_finished') setHistoryVersion((value) => value + 1)
    })
    const offExit = window.desktop.run.onExit(({ code }) => {
      // A sidecar that exits non-zero without an error event died before it
      // could speak the protocol — on macOS this is usually quarantine.
      if (code !== 0 && useRunStore.getState().status === 'running') {
        fail(i18n.t('common:app.engineExited', { code: String(code) }))
      }
    })
    return () => {
      offEvent()
      offExit()
    }
  }, [apply, fail])

  const navigate = useCallback((next: View, id?: string) => {
    setView(next)
    setHistoryId(id ?? null)
  }, [])

  const start = useCallback(
    async (input: {
      ticker: string
      date: string
      analysts: typeof settings.defaultAnalysts
      debateRounds: number
      outputLanguage: string
      checkpointEnabled: boolean
    }) => {
      setView('dashboard')
      try {
        const { runId: newRunId } = await window.desktop.run.start({
          ticker: input.ticker,
          date: input.date,
          analysts: input.analysts,
          config: {
            max_debate_rounds: input.debateRounds,
            max_risk_discuss_rounds: input.debateRounds,
            output_language: input.outputLanguage,
            checkpoint_enabled: input.checkpointEnabled
          }
        })
        begin({
          runId: newRunId,
          ticker: input.ticker,
          date: input.date,
          analysts: input.analysts,
          assetType: 'stock'
        })
      } catch (error) {
        begin({
          runId: 'failed',
          ticker: input.ticker,
          date: input.date,
          analysts: input.analysts,
          assetType: 'stock'
        })
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [begin, fail]
  )

  return (
    <div className="flex h-full min-h-0">
      <Sidebar view={view} onNavigate={navigate} historyVersion={historyVersion} />
      <main className="bg-background flex min-w-0 flex-1 flex-col">
        <div className="drag-region bg-sidebar h-9 shrink-0 border-b" />
        <div className="min-h-0 flex-1">
          {view === 'form' && (
            <NewAnalysis
              key={settingsLoaded ? 'ready' : 'loading'}
              onStart={(input) => void start(input)}
              busy={status === 'running'}
            />
          )}
          {view === 'dashboard' && <Dashboard key={runId ?? 'idle'} />}
          {view === 'settings' && <SettingsView />}
          {view === 'history' && <History selectedId={historyId} />}
        </div>
      </main>
    </div>
  )
}
