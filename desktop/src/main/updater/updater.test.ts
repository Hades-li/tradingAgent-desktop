import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/update'
import { staticFeed } from './manifest'
import { Updater, type UpdaterOptions } from './updater'

const PAYLOAD = Buffer.from('pretend this is a 200 MB installer')
const SHA512 = createHash('sha512').update(PAYLOAD).digest('base64')

function manifest(version: string, sha512 = SHA512): string {
  return `version: ${version}\nfiles:\n  - url: TradingAgents-Setup-${version}.exe\n    sha512: ${sha512}\n    size: ${PAYLOAD.length}\n`
}

describe('Updater', () => {
  let workDir: string
  let states: UpdateState[]
  let activeRuns: boolean
  let served: string
  let install: ReturnType<typeof vi.fn<UpdaterOptions['install']>>
  let confirm: ReturnType<typeof vi.fn<UpdaterOptions['confirmInterrupt']>>
  let fetch: ReturnType<typeof vi.fn<UpdaterOptions['fetch']>>

  function create(currentVersion = '0.1.0'): Updater {
    return new Updater({
      feed: staticFeed('https://updates.test'),
      platform: 'win32',
      arch: 'x64',
      currentVersion,
      workDir,
      fetch,
      publish: (state) => states.push(state),
      hasActiveRuns: () => activeRuns,
      confirmInterrupt: confirm,
      install,
      messages: {
        httpError: (status) => `http ${status}`,
        badManifest: () => 'bad manifest',
        checksumMismatch: () => 'checksum mismatch'
      }
    })
  }

  beforeEach(async () => {
    workDir = join(await mkdtemp(join(tmpdir(), 'updater-')), 'updates')
    states = []
    activeRuns = false
    served = manifest('0.2.0')
    install = vi.fn<UpdaterOptions['install']>().mockResolvedValue(undefined)
    confirm = vi.fn<UpdaterOptions['confirmInterrupt']>().mockResolvedValue(true)
    fetch = vi.fn<UpdaterOptions['fetch']>(async (url) =>
      url.endsWith('.yml') ? new Response(served) : new Response(PAYLOAD)
    )
  })

  afterEach(async () => {
    await rm(join(workDir, '..'), { recursive: true, force: true })
  })

  it('stays idle when the published version is not newer', async () => {
    const updater = create('0.2.0')
    await updater.check()
    expect(updater.state).toEqual({ phase: 'idle' })
    expect(states).toEqual([])
  })

  it('announces a newer version without downloading it', async () => {
    const updater = create()
    await updater.check()
    expect(updater.state).toEqual({ phase: 'available', version: '0.2.0' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('installs right after the download when nothing is running', async () => {
    const updater = create()
    await updater.check()
    await updater.download()
    const file = join(workDir, '0.2.0', 'TradingAgents-Setup-0.2.0.exe')
    expect(install).toHaveBeenCalledWith(file, workDir)
    expect(existsSync(file)).toBe(true)
    expect(updater.state).toEqual({ phase: 'installing', version: '0.2.0' })
    expect(states.some((state) => state.phase === 'downloading')).toBe(true)
  })

  it('waits for an explicit click while an analysis is running', async () => {
    activeRuns = true
    const updater = create()
    await updater.check()
    await updater.download()
    expect(updater.state).toEqual({ phase: 'ready', version: '0.2.0' })
    expect(install).not.toHaveBeenCalled()

    activeRuns = false
    await updater.install()
    expect(confirm).not.toHaveBeenCalled()
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('asks before installing over a run that is still going, and respects "later"', async () => {
    activeRuns = true
    confirm.mockResolvedValue(false)
    const updater = create()
    await updater.check()
    await updater.download()
    await updater.install()
    expect(confirm).toHaveBeenCalledWith('0.2.0')
    expect(install).not.toHaveBeenCalled()
    expect(updater.state.phase).toBe('ready')
  })

  it('refuses a download that fails verification and lets the user retry', async () => {
    served = manifest('0.2.0', 'not-the-right-hash')
    const updater = create()
    await updater.check()
    await updater.download()
    expect(updater.state).toEqual({ phase: 'error', version: '0.2.0', message: 'checksum mismatch' })
    expect(install).not.toHaveBeenCalled()

    fetch.mockClear()
    await updater.download()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(updater.state.phase).toBe('error')
  })

  it('reuses a verified download when retrying a failed install', async () => {
    install.mockRejectedValueOnce(new Error('folder not writable'))
    const updater = create()
    await updater.check()
    await updater.download()
    expect(updater.state).toEqual({ phase: 'error', version: '0.2.0', message: 'folder not writable' })

    fetch.mockClear()
    await updater.download()
    expect(fetch).not.toHaveBeenCalled()
    expect(install).toHaveBeenCalledTimes(2)
  })

  it('reports HTTP failures from the asset host', async () => {
    fetch.mockImplementation(async (url) =>
      url.endsWith('.yml') ? new Response(served) : new Response('gone', { status: 404 })
    )
    const updater = create()
    await updater.check()
    await updater.download()
    expect(updater.state).toEqual({ phase: 'error', version: '0.2.0', message: 'http 404' })
  })

  it('surfaces a broken manifest to the caller instead of changing state', async () => {
    served = '<html>rate limited</html>'
    const updater = create()
    await expect(updater.check()).rejects.toThrow('bad manifest')
    expect(updater.state).toEqual({ phase: 'idle' })
  })
})
