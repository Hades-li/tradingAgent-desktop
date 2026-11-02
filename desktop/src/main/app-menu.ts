/**
 * The application menu. It matches Electron's default menu, plus a "Check for
 * Updates…" item under About (macOS) or under Help (Windows/Linux), so a user
 * can ask for an update instead of waiting for the periodic check.
 */

import { type BrowserWindow, type MenuItemConstructorOptions, Menu, app, dialog } from 'electron'
import { mainT } from './i18n'
import type { Updater } from './updater/updater'

type MessageBoxOptions = Parameters<typeof dialog.showMessageBox>[0]

let checking = false

async function show(parent: BrowserWindow | null, options: MessageBoxOptions): Promise<number> {
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return response
}

/** Unlike the scheduled check, this one reports every outcome, failures included. */
async function checkForUpdates(updater: Updater | null, parent: BrowserWindow | null): Promise<void> {
  const t = mainT()
  if (!updater) {
    await show(parent, { type: 'info', message: t('updateCheckUnavailable') })
    return
  }
  if (checking) return
  checking = true
  try {
    await updater.check()
  } catch (error) {
    await show(parent, {
      type: 'error',
      message: t('updateCheckFailed'),
      detail: error instanceof Error ? error.message : String(error)
    })
    return
  } finally {
    checking = false
  }

  const state = updater.state
  switch (state.phase) {
    case 'idle':
      await show(parent, {
        type: 'info',
        message: t('updateUpToDate'),
        detail: t('updateUpToDateDetail', { version: app.getVersion() })
      })
      return
    case 'available':
    case 'error': {
      const response = await show(parent, {
        type: 'info',
        message: t('updateAvailable', { version: state.version }),
        detail: t('updateAvailableDetail', { current: app.getVersion() }),
        buttons: [t('updateDownloadNow'), t('updateInterruptCancel')],
        defaultId: 0,
        cancelId: 1
      })
      if (response === 0) void updater.download()
      return
    }
    default:
      await show(parent, { type: 'info', message: t('updateInProgress', { version: state.version }) })
  }
}

export function installAppMenu(updater: Updater | null, window: () => BrowserWindow | null): void {
  const t = mainT()
  const checkItem: MenuItemConstructorOptions = {
    label: t('menuCheckForUpdates'),
    click: () => void checkForUpdates(updater, window())
  }
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              checkItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          },
          { role: 'fileMenu' },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' }
        ]
      : [
          { role: 'fileMenu' },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' },
          { role: 'help', submenu: [checkItem] }
        ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
