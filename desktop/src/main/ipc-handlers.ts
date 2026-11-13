/**
 * The renderer's entire privilege surface. Every handler is explicit: the
 * renderer can start/cancel runs, read and write settings, write (never read)
 * API keys, list an endpoint's models, browse saved reports, and step
 * an already-discovered update forward (never choose where it comes from).
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, ipcMain, shell } from 'electron'
import type { OptionsPayload, RunRequest } from '@shared/protocol'
import type { Settings } from '@shared/settings'
import type { UpdateState } from '@shared/update'
import { parseEngineReply } from './engine-reply'
import { buildRunConfig, buildSpawnEnv } from './env-builder'
import { clearKey, decryptAll, keyStatus, setKey } from './keychain'
import { resolveSidecar, sidecarCwd } from './python-bridge'
import { mainT } from './i18n'
import { ENDPOINT_KEY_ENV, ModelListError, listEndpointModels, resolveEndpoint } from './model-list'
import { listReports, readReport, reportDirName } from './reports-reader'
import type { RunManager } from './run-manager'
import { loadSettings, saveSettings } from './settings-store'
import type { Updater } from './updater/updater'

const execFileAsync = promisify(execFile)

/** Where finished runs are archived; also what the history view lists. */
export function reportsRoot(): string {
  return join(app.getPath('userData'), 'reports')
}

/** Run one short-lived sidecar command and return its single reply line. */
async function queryEngine(request: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { command, baseArgs } = resolveSidecar()
  try {
    const { stdout } = await execFileAsync(
      command,
      [...baseArgs, JSON.stringify({ v: 1, ...request })],
      { cwd: sidecarCwd(), maxBuffer: 8 * 1024 * 1024 }
    )
    return parseEngineReply(stdout)
  } catch (error) {
    parseEngineReply(String((error as { stdout?: unknown }).stdout ?? ''))
    throw error
  }
}

/**
 * Ask Python for the provider/model catalog instead of keeping a second copy
 * in TypeScript.
 */
async function fetchOptions(): Promise<OptionsPayload> {
  const reply = await queryEngine({ command: 'options' })
  if (!reply) throw new Error(mainT()('engineNoOptions'))
  return reply as unknown as OptionsPayload
}

/**
 * Models served by a user-supplied endpoint. The key is looked up here by the
 * provider's own env name, so the renderer can never aim an arbitrary key at
 * an arbitrary URL.
 */
async function fetchEndpointModels(provider: string, backendUrl: string | null): Promise<string[]> {
  const t = mainT()
  try {
    const endpoint = resolveEndpoint(provider, backendUrl, process.env)
    const keyEnv = ENDPOINT_KEY_ENV[provider]
    const apiKey = keyEnv ? (decryptAll()[keyEnv] ?? process.env[keyEnv]) : undefined
    return await listEndpointModels(endpoint, apiKey)
  } catch (error) {
    if (!(error instanceof ModelListError)) {
      throw new Error(t('modelsRequestFailed', { message: (error as Error).message }))
    }
    if (error.reason === 'http') throw new Error(t('modelsHttpError', { status: error.status ?? 0 }))
    if (error.reason === 'noEndpoint') throw new Error(t('modelsNoEndpoint'))
    if (error.reason === 'unsupported') throw new Error(t('modelsUnsupported'))
    throw new Error(t('modelsBadResponse'))
  }
}

export function registerIpcHandlers(
  runManager: RunManager,
  updater: Updater | null,
  onSettingsSaved: () => void
): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_event, settings: Settings) => {
    const saved = saveSettings(settings)
    onSettingsSaved()
    return saved
  })
  ipcMain.handle('settings:options', () => fetchOptions())
  ipcMain.handle('models:list', (_event, provider: string, backendUrl: string | null) =>
    fetchEndpointModels(provider, backendUrl)
  )

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

  ipcMain.handle('update:get', (): UpdateState => updater?.state ?? { phase: 'idle' })
  ipcMain.handle('update:download', () => updater?.download())
  ipcMain.handle('update:install', () => updater?.install())
}
