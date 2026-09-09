/**
 * Electron entry point: one window, one run manager, no remote content.
 */

import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { registerIpcHandlers } from './ipc-handlers'
import { RunManager, webContentsSink } from './run-manager'

let mainWindow: BrowserWindow | null = null

const runManager = new RunManager(
  webContentsSink(() => mainWindow?.webContents ?? null)
)

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
    void mainWindow.loadURL(devServer)
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(runManager)
  createWindow()

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
