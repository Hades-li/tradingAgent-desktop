/**
 * Settings + provider catalog. The catalog comes from Python (`command:
 * "options"`) so the model list cannot drift from the CLI's.
 */

import { create } from 'zustand'
import type { OptionsPayload } from '@shared/protocol'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

interface SettingsState {
  settings: Settings
  options: OptionsPayload | null
  keyStatus: Record<string, 'stored' | 'env' | 'missing'>
  loaded: boolean
  optionsError: string | null
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => void
  save: () => Promise<void>
  setKey: (name: string, value: string) => Promise<void>
  clearKey: (name: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  options: null,
  keyStatus: {},
  loaded: false,
  optionsError: null,

  load: async () => {
    const settings = await window.desktop.settings.get()
    set({ settings, loaded: true })
    try {
      const options = await window.desktop.settings.options()
      const names = options.providers
        .map((provider) => provider.apiKeyEnv)
        .filter((name): name is string => Boolean(name))
      const keyStatus = await window.desktop.keys.status(names)
      set({ options, keyStatus, optionsError: null })
    } catch (error) {
      // The app still works with saved settings; only the catalog is missing.
      set({ optionsError: error instanceof Error ? error.message : String(error) })
    }
  },

  update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

  save: async () => {
    const saved = await window.desktop.settings.save(get().settings)
    set({ settings: saved })
  },

  setKey: async (name, value) => {
    const status = await window.desktop.keys.set(name, value)
    set((state) => ({ keyStatus: { ...state.keyStatus, ...status } }))
  },

  clearKey: async (name) => {
    const status = await window.desktop.keys.clear(name)
    set((state) => ({ keyStatus: { ...state.keyStatus, ...status } }))
  }
}))
