/**
 * Non-secret settings persisted as JSON under `app.getPath('userData')`.
 *
 * Deliberately not `.env`: the desktop app must not fight the CLI over a file
 * the user also edits by hand, and `.env` cannot hold secrets safely anyway.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings'

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  const file = settingsPath()
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<Settings>
    // Merge over defaults so a settings file written by an older version keeps
    // working when new keys are added.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      dataVendors: { ...DEFAULT_SETTINGS.dataVendors, ...(parsed.dataVendors ?? {}) }
    }
  } catch (error) {
    console.error('settings.json is unreadable, falling back to defaults:', error)
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): Settings {
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  // Write-then-rename: a crash mid-write must not leave a truncated file that
  // silently resets every setting on next launch.
  const temporary = `${file}.tmp`
  writeFileSync(temporary, JSON.stringify(settings, null, 2), 'utf-8')
  renameSync(temporary, file)
  return settings
}
