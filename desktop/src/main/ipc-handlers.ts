/**
 * The renderer's entire privilege surface. Every handler is explicit: the
 * renderer can start/cancel runs, read and write settings, write (never read)
 * API keys, and browse saved reports.
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, ipcMain, shell } from 'electron'
import type { OptionsPayload, RunRequest } from '@shared/protocol'
import type { Settings } from '@shared/settings'
import { buildRunConfig, buildSpawnEnv } from './env-builder'
import { clearKey, decryptAll, keyStatus, setKey } from './keychain'
import { resolveSidecar, sidecarCwd } from './python-bridge'
import { listReports, readReport, reportDirName } from './reports-reader'
import type { RunManager } from './run-manager'
import { loadSettings, saveSettings } from './settings-store'

const execFileAsync = promisify(execFile)

/** Where finished runs are archived; also what the history view lists. */
export function reportsRoot(): string {
  return join(app.getPath('userData'), 'reports')
}

/**
 * Ask Python for the provider/model catalog instead of keeping a second copy
 * in TypeScript. Runs a short-lived process; the payload is one JSON line.
 */
async function fetchOptions(): Promise<OptionsPayload> {
  const { command, baseArgs } = resolveSidecar()
  const { stdout } = await execFileAsync(
    command,
    [...baseArgs, JSON.stringify({ v: 1, command: 'options' })],
    { cwd: sidecarCwd(), maxBuffer: 8 * 1024 * 1024 }
  )
  const line = stdout.split('\n').find((candidate) => candidate.trim().startsWith('{'))
  if (!line) throw new Error('分析引擎没有返回选项数据')
  return JSON.parse(line) as OptionsPayload
}

export function registerIpcHandlers(runManager: RunManager): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_event, settings: Settings) => saveSettings(settings))
  ipcMain.handle('settings:options', () => fetchOptions())

  ipcMain.handle('keys:status', (_event, names: string[]) => keyStatus(names))
  ipcMain.handle('keys:set', (_event, name: string, value: string) => {
    setKey(name, value)
    return keyStatus([name])
  })
  ipcMain.handle('keys:clear', (_event, name: string) => {
    clearKey(name)
    return keyStatus([name])
  })

  ipcMain.handle('run:start', (_event, request: RunRequest) => {
    const runId = request.runId ?? randomUUID()
    const settings = loadSettings()
    const { command, baseArgs } = resolveSidecar()
    const savePath = join(reportsRoot(), reportDirName(request.ticker))
    runManager.start(
      runId,
      {
        ...request,
        v: 1,
        runId,
        savePath,
        config: { ...buildRunConfig(settings), ...(request.config ?? {}) }
      },
      {
        command,
        args: baseArgs,
        cwd: sidecarCwd(),
        env: buildSpawnEnv(process.env, settings, decryptAll())
      }
    )
    return { runId, savePath }
  })

  ipcMain.handle('run:cancel', (_event, runId: string) => runManager.cancel(runId))

  ipcMain.handle('history:list', () => listReports(reportsRoot()))
  ipcMain.handle('history:read', (_event, id: string) => readReport(reportsRoot(), id))
  ipcMain.handle('history:reveal', (_event, path: string) => shell.showItemInFolder(path))
}
