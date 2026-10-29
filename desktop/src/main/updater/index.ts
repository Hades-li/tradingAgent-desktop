/**
 * Wires the updater to Electron: where to look, how to fetch (Chromium's
 * stack, so the system proxy applies), who to tell, and when to check.
 *
 * The feed comes from the `app-update.yml` electron-builder writes into the
 * packaged resources from the `publish` block in electron-builder.yml, so the
 * release location is configured in exactly one place.
 * `TRADINGAGENTS_UPDATE_URL` overrides it with a static directory, which is
 * also the only way to exercise the flow in development.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BrowserWindow, app, dialog, net } from 'electron'
import type { UpdateState } from '@shared/update'
import { mainT } from '../i18n'
import { installUpdate } from './install'
import { feedFromAppUpdateConfig, staticFeed, type UpdateFeed } from './manifest'
import { Updater } from './updater'

const FIRST_CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

function resolveFeed(): UpdateFeed | null {
  const override = process.env.TRADINGAGENTS_UPDATE_URL
  if (override) return staticFeed(override)
  if (!app.isPackaged) return null
  try {
    return feedFromAppUpdateConfig(readFileSync(join(process.resourcesPath, 'app-update.yml'), 'utf-8'))
  } catch {
    return null
  }
}

export interface UpdaterHost {
  publish: (state: UpdateState) => void
  hasActiveRuns: () => boolean
  window: () => BrowserWindow | null
}

/** Null when this build has nowhere to update from (dev, Linux, no publish config). */
export function createUpdater(host: UpdaterHost): Updater | null {
  const feed = resolveFeed()
  if (!feed) return null
  const updater = new Updater({
    feed,
    platform: process.platform,
    arch: process.arch,
    currentVersion: app.getVersion(),
    workDir: join(app.getPath('userData'), 'updates'),
    fetch: (url, init) => net.fetch(url, init),
    publish: host.publish,
    hasActiveRuns: host.hasActiveRuns,
    confirmInterrupt: async (version) => {
      const t = mainT()
      const options = {
        type: 'warning' as const,
        message: t('updateInterruptMessage'),
        detail: t('updateInterruptDetail', { version }),
        buttons: [t('updateInterruptConfirm'), t('updateInterruptCancel')],
        defaultId: 1,
        cancelId: 1
      }
      const parent = host.window()
      const { response } = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)
      return response === 0
    },
    install: installUpdate,
    messages: {
      httpError: (status) => mainT()('updateHttpError', { status: String(status) }),
      badManifest: () => mainT()('updateBadManifest'),
      checksumMismatch: () => mainT()('updateChecksumMismatch')
    }
  })
  return updater.supported ? updater : null
}

/** Checks are silent: an offline machine just never sees the button. */
export function scheduleUpdateChecks(updater: Updater): void {
  const check = (): void => {
    updater.check().catch((error) => console.warn('[updater] check failed:', error))
  }
  setTimeout(() => {
    void updater.cleanup().then(check)
    setInterval(check, CHECK_INTERVAL_MS).unref()
  }, FIRST_CHECK_DELAY_MS).unref()
}
