/**
 * Electron entry point: one window, one run manager, no remote content.
 */

import { join } from 'node:path'
import { BrowserWindow, app, session, shell } from 'electron'
import { mainT } from './i18n'
import { registerIpcHandlers } from './ipc-handlers'
import { RunManager, webContentsSink } from './run-manager'
import { createUpdater, scheduleUpdateChecks } from './updater'

let mainWindow: BrowserWindow | null = null

const sink = webContentsSink(() => mainWindow?.webContents ?? null)

const runManager = new RunManager(sink, (message) => mainT()('engineStartFailed', { message }))

/**
 * The market picker reads Yahoo Finance from the renderer, and Yahoo sends no
 * CORS headers. The packaged app loads from file://, which Chromium does not
 * CORS-check, but the dev server is an http origin, so answer CORS for it.
 * Requests still go through Chromium: Yahoo rate-limits Node's TLS client.
 */
function allowYahooFromDevServer(origin: string): void {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://*.yahoo.com/*'] },
    (details, callback) => {
      const headers = Object.fromEntries(
        Object.entries(details.responseHeaders ?? {}).filter(
          ([name]) => !name.toLowerCase().startsWith('access-control-')
        )
      )
      headers['Access-Control-Allow-Origin'] = [origin]
      headers['Access-Control-Allow-Credentials'] = ['true']
      headers['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS']
      headers['Access-Control-Allow-Headers'] = ['Content-Type']
      callback({ responseHeaders: headers })
    }
  )
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // The main bundle is ESM (package.json "type": "module"), so paths are
      // resolved from import.meta rather than __dirname.
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      // The renderer never touches Node or the filesystem directly; everything
      // goes through the vetted preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // External links open in the user's browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServer) {
    allowYahooFromDevServer(new URL(devServer).origin)
    void mainWindow.loadURL(devServer)
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const updater = createUpdater({
    publish: (state) => sink('update:changed', state),
    hasActiveRuns: () => runManager.activeRunIds.length > 0,
    window: () => mainWindow
  })
  registerIpcHandlers(runManager, updater)
  createWindow()
  if (updater) scheduleUpdateChecks(updater)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Without this, closing the window leaves the sidecar running and burning
// tokens against the user's API key.
app.on('before-quit', () => runManager.cancelAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
