/**
 * The allow-list bridge. Nothing here exposes ipcRenderer itself, and no
 * channel can read a stored API key back out.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  MarketKey,
  MarketListPayload,
  OptionsPayload,
  RunEvent,
  RunRequest,
  SymbolSearchPayload
} from '@shared/protocol'
import type { Settings } from '@shared/settings'

export type KeyState = 'stored' | 'env' | 'missing'

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    save: (settings: Settings): Promise<Settings> =>
      ipcRenderer.invoke('settings:save', settings),
    options: (): Promise<OptionsPayload> => ipcRenderer.invoke('settings:options')
  },
  keys: {
    status: (names: string[]): Promise<Record<string, KeyState>> =>
      ipcRenderer.invoke('keys:status', names),
    set: (name: string, value: string): Promise<Record<string, KeyState>> =>
      ipcRenderer.invoke('keys:set', name, value),
    clear: (name: string): Promise<Record<string, KeyState>> =>
      ipcRenderer.invoke('keys:clear', name)
  },
  run: {
    start: (request: RunRequest): Promise<{ runId: string; savePath: string }> =>
      ipcRenderer.invoke('run:start', request),
    cancel: (runId: string): Promise<boolean> => ipcRenderer.invoke('run:cancel', runId),
    onEvent: (handler: (payload: { runId: string; event: RunEvent }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { runId: string; event: RunEvent }): void =>
        handler(payload)
      ipcRenderer.on('run:event', listener)
      return () => ipcRenderer.removeListener('run:event', listener)
    },
    onLog: (handler: (payload: { runId: string; line: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { runId: string; line: string }): void =>
        handler(payload)
      ipcRenderer.on('run:log', listener)
      return () => ipcRenderer.removeListener('run:log', listener)
    },
    onExit: (
      handler: (payload: { runId: string; code: number | null; signal: string | null }) => void
    ): (() => void) => {
      const listener = (
        _e: unknown,
        payload: { runId: string; code: number | null; signal: string | null }
      ): void => handler(payload)
      ipcRenderer.on('run:exit', listener)
      return () => ipcRenderer.removeListener('run:exit', listener)
    }
  },
  market: {
    list: (market: MarketKey): Promise<MarketListPayload> =>
      ipcRenderer.invoke('market:list', market),
    search: (market: MarketKey, query: string): Promise<SymbolSearchPayload> =>
      ipcRenderer.invoke('market:search', market, query)
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    read: (id: string) => ipcRenderer.invoke('history:read', id),
    reveal: (path: string) => ipcRenderer.invoke('history:reveal', path)
  }
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('desktop', api)
