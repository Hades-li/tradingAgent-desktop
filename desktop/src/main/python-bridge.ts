/**
 * Locate the Python sidecar for both development and packaged builds.
 *
 * Dev: the repo's own virtualenv runs `python -m tradingagents.ipc_main`.
 * Packaged: a PyInstaller --onedir bundle under `process.resourcesPath/sidecar`
 * (onefile would re-extract pandas/langchain on every launch).
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { mainT } from './i18n'

export interface SidecarCommand {
  command: string
  baseArgs: string[]
}

/** Repo root = the parent of `desktop/`, both in dev and from `out/main`. */
export function repoRoot(): string {
  return resolve(app.getAppPath(), '..')
}

function packagedSidecar(): string {
  const name = process.platform === 'win32' ? 'tradingagents-sidecar.exe' : 'tradingagents-sidecar'
  return join(process.resourcesPath, 'sidecar', name)
}

export function resolveSidecar(): SidecarCommand {
  if (app.isPackaged) {
    const binary = packagedSidecar()
    if (!existsSync(binary)) {
      throw new Error(mainT()('engineNotFound', { binary }))
    }
    return { command: binary, baseArgs: [] }
  }

  // An explicit interpreter wins, so a contributor can point at any env.
  const explicit = process.env.TRADINGAGENTS_PYTHON
  const venv = join(
    repoRoot(),
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  )
  const interpreter = explicit ?? (existsSync(venv) ? venv : 'python3')
  return { command: interpreter, baseArgs: ['-m', 'tradingagents.ipc_main'] }
}

/**
 * Working directory for the child. `cli/main.py` resolves a few paths against
 * the CWD, and a packaged app's CWD is undefined, so pin it to userData.
 */
export function sidecarCwd(): string {
  return app.isPackaged ? app.getPath('userData') : repoRoot()
}
