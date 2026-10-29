/**
 * Reading the update metadata electron-builder publishes next to each release:
 * `latest.yml` (Windows NSIS) and `latest-mac.yml` (macOS zip), plus the
 * `app-update.yml` it bakes into the packaged app's resources to say where
 * those live. Everything here is pure so it can be tested without Electron.
 */

import { parse } from 'yaml'

export interface UpdateAsset {
  /** File name relative to the release, or an absolute URL. */
  url: string
  /** Base64 SHA-512, as electron-builder writes it. */
  sha512: string
  size: number
}

export interface UpdateManifest {
  version: string
  files: UpdateAsset[]
}

export interface UpdateFeed {
  manifestUrl: (name: string) => string
  assetUrl: (version: string, file: string) => string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Which manifest describes this platform's installer; null = no in-app updates. */
export function manifestName(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'win32') return 'latest.yml'
  return null
}

export function parseManifest(text: string): UpdateManifest | null {
  const root = record(parse(text))
  if (!root) return null
  const version = root.version === undefined ? '' : String(root.version)
  if (!version || !Array.isArray(root.files)) return null
  const files = root.files.flatMap((entry): UpdateAsset[] => {
    const item = record(entry)
    if (!item || typeof item.url !== 'string' || typeof item.sha512 !== 'string') return []
    return [{ url: item.url, sha512: item.sha512, size: Number(item.size) || 0 }]
  })
  return { version, files }
}

/**
 * The file this machine should download: the NSIS installer on Windows, the
 * zip (not the DMG) on macOS, preferring one built for the running arch.
 */
export function pickAsset(
  manifest: UpdateManifest,
  platform: NodeJS.Platform,
  arch: string
): UpdateAsset | null {
  const extension = platform === 'darwin' ? '.zip' : platform === 'win32' ? '.exe' : null
  if (!extension) return null
  const candidates = manifest.files.filter((file) => file.url.toLowerCase().endsWith(extension))
  return candidates.find((file) => file.url.includes(arch)) ?? candidates[0] ?? null
}

function splitVersion(version: string): { core: number[]; pre: string[] } {
  const [core, ...pre] = version.trim().replace(/^v/, '').split('+')[0].split('-')
  return {
    core: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre.length ? pre.join('-').split('.') : []
  }
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left)
  const rightNumber = /^\d+$/.test(right)
  if (leftNumber && rightNumber) return Number(left) - Number(right)
  if (leftNumber !== rightNumber) return leftNumber ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}

/** Semver precedence, enough for release tags: true when `candidate` > `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const next = splitVersion(candidate)
  const installed = splitVersion(current)
  for (let index = 0; index < Math.max(next.core.length, installed.core.length); index += 1) {
    const difference = (next.core[index] ?? 0) - (installed.core[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  if (!next.pre.length || !installed.pre.length) return !next.pre.length && installed.pre.length > 0
  for (let index = 0; index < Math.max(next.pre.length, installed.pre.length); index += 1) {
    if (next.pre[index] === undefined) return false
    if (installed.pre[index] === undefined) return true
    const difference = compareIdentifiers(next.pre[index], installed.pre[index])
    if (difference !== 0) return difference > 0
  }
  return false
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveAsset(base: string, file: string): string {
  return /^https?:\/\//i.test(file) ? file : `${base}/${encodeURIComponent(file)}`
}

/**
 * GitHub Releases: `latest/download` follows the newest published (non-draft,
 * non-prerelease) release, and files are then fetched from that exact tag.
 */
export function githubFeed(owner: string, repo: string): UpdateFeed {
  const releases = `https://github.com/${owner}/${repo}/releases`
  return {
    manifestUrl: (name) => `${releases}/latest/download/${name}`,
    assetUrl: (version, file) => resolveAsset(`${releases}/download/v${version}`, file)
  }
}

/** Any static host serving the manifests and installers from one directory. */
export function staticFeed(baseUrl: string): UpdateFeed {
  const base = trimSlash(baseUrl)
  return {
    manifestUrl: (name) => `${base}/${name}`,
    assetUrl: (_version, file) => resolveAsset(base, file)
  }
}

/** Turn electron-builder's `app-update.yml` into a feed; null if unusable. */
export function feedFromAppUpdateConfig(text: string): UpdateFeed | null {
  const config = record(parse(text))
  if (!config) return null
  if (config.provider === 'github' && typeof config.owner === 'string' && typeof config.repo === 'string') {
    return githubFeed(config.owner, config.repo)
  }
  if (config.provider === 'generic' && typeof config.url === 'string') return staticFeed(config.url)
  return null
}

/**
 * The `.app` bundle containing the running executable, e.g.
 * `/Applications/TradingAgents.app` for `.../Contents/MacOS/TradingAgents`.
 */
export function macBundlePath(execPath: string): string | null {
  const marker = '.app/Contents/MacOS/'
  const index = execPath.indexOf(marker)
  return index === -1 ? null : execPath.slice(0, index + '.app'.length)
}

/**
 * Gatekeeper runs a quarantined app from a randomised read-only mount
 * (App Translocation); swapping that path would replace nothing. A copy
 * launched straight from the DMG is caught later by the write-access check.
 */
export function isTranslocated(bundlePath: string): boolean {
  return bundlePath.includes('/AppTranslocation/')
}
