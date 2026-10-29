/**
 * The renderer's entire privilege surface. Every handler is explicit: the
 * renderer can start/cancel runs, read and write settings, write (never read)
 * API keys, browse saved reports, look up market lists and symbols, and step
 * an already-discovered update forward (never choose where it comes from).
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, ipcMain, shell } from 'electron'
import type {
  MarketKey,
  MarketListPayload,
  OptionsPayload,
  RunRequest,
  SymbolSearchPayload
} from '@shared/protocol'
import type { Settings } from '@shared/settings'
import type { UpdateState } from '@shared/update'
import { parseEngineReply, TtlCache } from './engine-reply'
import { buildRunConfig, buildSpawnEnv } from './env-builder'
import { clearKey, decryptAll, keyStatus, setKey } from './keychain'
import { resolveSidecar, sidecarCwd } from './python-bridge'
import { mainT } from './i18n'
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

const marketLists = new TtlCache<MarketKey, MarketListPayload>(5 * 60 * 1000)

/** Market lists barely move within minutes; caching keeps tab switches instant. */
async function fetchMarketList(market: MarketKey): Promise<MarketListPayload> {
  const cached = marketLists.get(market)
  if (cached) return cached
  const reply = await queryEngine({ command: 'market_list', market })
  if (!reply) throw new Error(mainT()('engineNoMarketData'))
  const payload = reply as unknown as MarketListPayload
  marketLists.set(market, payload)
  return payload
}

async function searchSymbols(market: MarketKey, query: string): Promise<SymbolSearchPayload> {
  const reply = await queryEngine({ command: 'symbol_search', market, query })
  if (!reply) throw new Error(mainT()('engineNoMarketData'))
  return reply as unknown as SymbolSearchPayload
}

export function registerIpcHandlers(runManager: RunManager, updater: Updater | null): void {
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

  ipcMain.handle('market:list', (_event, market: MarketKey) => fetchMarketList(market))
  ipcMain.handle('market:search', (_event, market: MarketKey, query: string) =>
    searchSymbols(market, query)
  )

  ipcMain.handle('history:list', () => listReports(reportsRoot()))
  ipcMain.handle('history:read', (_event, id: string) => readReport(reportsRoot(), id))
  ipcMain.handle('history:reveal', (_event, path: string) => shell.showItemInFolder(path))

  ipcMain.handle('update:get', (): UpdateState => updater?.state ?? { phase: 'idle' })
  ipcMain.handle('update:download', () => updater?.download())
  ipcMain.handle('update:install', () => updater?.install())
}
