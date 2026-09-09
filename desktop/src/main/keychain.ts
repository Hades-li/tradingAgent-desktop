/**
 * API keys, encrypted at rest with Electron's `safeStorage` (macOS Keychain /
 * DPAPI / libsecret).
 *
 * Plaintext exists only in the main process and in the spawned Python process's
 * environment. The renderer can ask *whether* a key is set and can write a new
 * one, but can never read one back.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import { repoRoot } from './python-bridge'

type Vault = Record<string, string>

function vaultPath(): string {
  return join(app.getPath('userData'), 'keys.enc.json')
}

function readVault(): Vault {
  const file = vaultPath()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Vault
  } catch (error) {
    console.error('key vault is unreadable:', error)
    return {}
  }
}

function writeVault(vault: Vault): void {
  const file = vaultPath()
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, JSON.stringify(vault, null, 2), 'utf-8')
  renameSync(temporary, file)
}

export function setKey(envName: string, value: string): void {
  const vault = readVault()
  if (!value) {
    delete vault[envName]
  } else if (safeStorage.isEncryptionAvailable()) {
    vault[envName] = safeStorage.encryptString(value).toString('base64')
  } else {
    // No OS keychain (e.g. a headless Linux session without libsecret). Refuse
    // rather than silently persisting a key in plaintext.
    throw new Error('系统钥匙串不可用，无法安全保存密钥')
  }
  writeVault(vault)
}

export function clearKey(envName: string): void {
  const vault = readVault()
  delete vault[envName]
  writeVault(vault)
}

/**
 * Names present in the project's `.env`.
 *
 * `tradingagents/__init__.py` loads that file with `override=False`, so those
 * values still apply as a fallback in development. Reporting them keeps the
 * settings screen honest instead of showing "未配置" for a key that works.
 * Only names are read — never values.
 */
function dotEnvNames(): Set<string> {
  if (app.isPackaged) return new Set()
  const file = join(repoRoot(), '.env')
  if (!existsSync(file)) return new Set()
  try {
    const names = readFileSync(file, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return {
          name: line.slice(0, separator).replace(/^export\s+/, '').trim(),
          // A declared-but-empty key (`OPENAI_API_KEY=`) is not configured;
          // .env templates ship full of them.
          value: line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
        }
      })
      .filter((entry) => entry.value.length > 0)
      .map((entry) => entry.name)
    return new Set(names)
  } catch {
    return new Set()
  }
}

/** Which key names are stored here, and which are merely inherited elsewhere. */
export function keyStatus(names: string[]): Record<string, 'stored' | 'env' | 'missing'> {
  const vault = readVault()
  const inherited = dotEnvNames()
  const status: Record<string, 'stored' | 'env' | 'missing'> = {}
  for (const name of names) {
    if (vault[name]) status[name] = 'stored'
    else if (process.env[name] || inherited.has(name)) status[name] = 'env'
    else status[name] = 'missing'
  }
  return status
}

/** Decrypt every stored key for injection into a child process. Main only. */
export function decryptAll(): Record<string, string> {
  const vault = readVault()
  const secrets: Record<string, string> = {}
  for (const [name, encrypted] of Object.entries(vault)) {
    try {
      secrets[name] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (error) {
      console.error(`could not decrypt ${name}:`, error)
    }
  }
  return secrets
}
