/**
 * The update state machine: check → available → downloading → (installing |
 * ready → installing). Nothing downloads until the user clicks; once the file
 * is verified it installs straight away unless an analysis is running, in
 * which case it waits in `ready` for a second, explicit click.
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { UpdateState } from '@shared/update'
import {
  isNewer,
  manifestName,
  parseManifest,
  pickAsset,
  type UpdateAsset,
  type UpdateFeed
} from './manifest'

export interface UpdaterMessages {
  httpError: (status: number) => string
  badManifest: () => string
  checksumMismatch: () => string
}

export interface UpdaterOptions {
  feed: UpdateFeed
  platform: NodeJS.Platform
  arch: string
  currentVersion: string
  /** Scratch directory owned by the updater; wiped before each fresh download. */
  workDir: string
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  publish: (state: UpdateState) => void
  hasActiveRuns: () => boolean
  /** Asked only when the user installs over a running analysis. */
  confirmInterrupt: (version: string) => Promise<boolean>
  /** Hands the verified file to the platform installer and quits the app. */
  install: (file: string, workDir: string) => Promise<void>
  messages: UpdaterMessages
}

const PROGRESS_INTERVAL_MS = 250

export class Updater {
  private current: UpdateState = { phase: 'idle' }
  private pending: { version: string; asset: UpdateAsset } | null = null
  private file: string | null = null

  constructor(private readonly options: UpdaterOptions) {}

  get state(): UpdateState {
    return this.current
  }

  get supported(): boolean {
    return manifestName(this.options.platform) !== null
  }

  private set(state: UpdateState): void {
    this.current = state
    this.options.publish(state)
  }

  private fail(version: string, error: unknown): void {
    console.error('[updater]', error)
    this.set({ phase: 'error', version, message: error instanceof Error ? error.message : String(error) })
  }

  /** Throws on network/format errors; callers decide whether that is worth surfacing. */
  async check(): Promise<void> {
    const name = manifestName(this.options.platform)
    const phase = this.current.phase
    if (!name || phase === 'downloading' || phase === 'ready' || phase === 'installing') return

    const response = await this.options.fetch(this.options.feed.manifestUrl(name), {
      headers: { 'Cache-Control': 'no-cache' }
    })
    if (!response.ok) throw new Error(this.options.messages.httpError(response.status))
    const manifest = parseManifest(await response.text())
    if (!manifest) throw new Error(this.options.messages.badManifest())

    if (!isNewer(manifest.version, this.options.currentVersion)) return
    if (this.pending?.version === manifest.version) return
    const asset = pickAsset(manifest, this.options.platform, this.options.arch)
    if (!asset) return

    this.pending = { version: manifest.version, asset }
    this.file = null
    this.set({ phase: 'available', version: manifest.version })
  }

  /** Also the retry path after an error: a verified file is reused, not refetched. */
  async download(): Promise<void> {
    const pending = this.pending
    const phase = this.current.phase
    if (!pending || (phase !== 'available' && phase !== 'error')) return

    const { version, asset } = pending
    this.set({ phase: 'downloading', version, received: 0, total: asset.size })
    try {
      this.file = await this.fetchAsset(version, asset)
    } catch (error) {
      this.fail(version, error)
      return
    }

    if (this.options.hasActiveRuns()) this.set({ phase: 'ready', version })
    else await this.runInstall(version)
  }

  /** The user's explicit "install now" after a download that had to wait. */
  async install(): Promise<void> {
    if (this.current.phase !== 'ready' || !this.pending) return
    const { version } = this.pending
    if (this.options.hasActiveRuns() && !(await this.options.confirmInterrupt(version))) return
    await this.runInstall(version)
  }

  /** Leftovers are either already installed or abandoned; neither is needed. */
  async cleanup(): Promise<void> {
    if (this.current.phase !== 'idle') return
    await rm(this.options.workDir, { recursive: true, force: true }).catch(() => undefined)
  }

  private async runInstall(version: string): Promise<void> {
    if (!this.file) return
    this.set({ phase: 'installing', version })
    try {
      await this.options.install(this.file, this.options.workDir)
    } catch (error) {
      this.fail(version, error)
    }
  }

  private async fetchAsset(version: string, asset: UpdateAsset): Promise<string> {
    const target = join(this.options.workDir, version, basename(asset.url))
    if (await matches(target, asset)) return target

    await rm(this.options.workDir, { recursive: true, force: true })
    await mkdir(join(this.options.workDir, version), { recursive: true })

    const response = await this.options.fetch(this.options.feed.assetUrl(version, asset.url))
    if (!response.ok || !response.body) {
      throw new Error(this.options.messages.httpError(response.status))
    }
    const total = Number(response.headers.get('content-length')) || asset.size
    const hash = createHash('sha512')
    let received = 0
    let lastPublished = 0
    const meter = new Transform({
      transform: (chunk: Buffer, _encoding, done) => {
        hash.update(chunk)
        received += chunk.length
        const now = Date.now()
        if (now - lastPublished >= PROGRESS_INTERVAL_MS) {
          lastPublished = now
          this.set({ phase: 'downloading', version, received, total })
        }
        done(null, chunk)
      }
    })

    const partial = `${target}.part`
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      meter,
      createWriteStream(partial)
    )
    this.set({ phase: 'downloading', version, received, total })
    if (hash.digest('base64') !== asset.sha512) {
      await rm(partial, { force: true })
      throw new Error(this.options.messages.checksumMismatch())
    }
    await rename(partial, target)
    return target
  }
}

async function matches(file: string, asset: UpdateAsset): Promise<boolean> {
  try {
    const info = await stat(file)
    if (asset.size && info.size !== asset.size) return false
  } catch {
    return false
  }
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('base64') === asset.sha512
}
