import { describe, expect, it } from 'vitest'
import {
  feedFromAppUpdateConfig,
  githubFeed,
  isNewer,
  isTranslocated,
  macBundlePath,
  parseManifest,
  pickAsset,
  staticFeed
} from './manifest'

// Shaped exactly like electron-builder's output, including the quoted date.
const MAC_MANIFEST = `version: 0.2.0
files:
  - url: TradingAgents-0.2.0-arm64-mac.zip
    sha512: c2hhNTEyLXppcA==
    size: 201234567
  - url: TradingAgents-0.2.0-arm64.dmg
    sha512: c2hhNTEyLWRtZw==
    size: 199999999
path: TradingAgents-0.2.0-arm64-mac.zip
sha512: c2hhNTEyLXppcA==
releaseDate: '2026-10-29T08:00:00.000Z'
`

describe('parseManifest', () => {
  it('reads the version and every file', () => {
    expect(parseManifest(MAC_MANIFEST)).toEqual({
      version: '0.2.0',
      files: [
        { url: 'TradingAgents-0.2.0-arm64-mac.zip', sha512: 'c2hhNTEyLXppcA==', size: 201234567 },
        { url: 'TradingAgents-0.2.0-arm64.dmg', sha512: 'c2hhNTEyLWRtZw==', size: 199999999 }
      ]
    })
  })

  it('rejects documents that are not update manifests', () => {
    expect(parseManifest('<html>rate limited</html>')).toBeNull()
    expect(parseManifest('version: 1.0.0\n')).toBeNull()
  })
})

describe('pickAsset', () => {
  const manifest = parseManifest(MAC_MANIFEST)!

  it('takes the zip on macOS, never the dmg', () => {
    expect(pickAsset(manifest, 'darwin', 'arm64')?.url).toBe('TradingAgents-0.2.0-arm64-mac.zip')
  })

  it('takes the installer on Windows and nothing elsewhere', () => {
    const windows = { version: '0.2.0', files: [{ url: 'TradingAgents-Setup-0.2.0.exe', sha512: 'x', size: 1 }] }
    expect(pickAsset(windows, 'win32', 'x64')?.url).toBe('TradingAgents-Setup-0.2.0.exe')
    expect(pickAsset(manifest, 'win32', 'x64')).toBeNull()
    expect(pickAsset(manifest, 'linux', 'x64')).toBeNull()
  })
})

describe('isNewer', () => {
  it.each([
    ['0.2.0', '0.1.0', true],
    ['0.1.10', '0.1.9', true],
    ['v1.0.0', '0.9.9', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['1.0.0', '1.0.0-beta.2', true],
    ['1.0.0-beta.2', '1.0.0', false],
    ['1.0.0-beta.10', '1.0.0-beta.9', true],
    ['1.0.0-rc.1', '1.0.0-beta.9', true]
  ])('%s over %s → %s', (candidate, current, expected) => {
    expect(isNewer(candidate, current)).toBe(expected)
  })
})

describe('feeds', () => {
  it('points GitHub at the latest manifest and the tagged asset', () => {
    const feed = githubFeed('Hades-li', 'tradingAgent-desktop')
    expect(feed.manifestUrl('latest-mac.yml')).toBe(
      'https://github.com/Hades-li/tradingAgent-desktop/releases/latest/download/latest-mac.yml'
    )
    expect(feed.assetUrl('0.2.0', 'TradingAgents Setup 0.2.0.exe')).toBe(
      'https://github.com/Hades-li/tradingAgent-desktop/releases/download/v0.2.0/TradingAgents%20Setup%200.2.0.exe'
    )
  })

  it('serves a static feed from one directory and keeps absolute asset URLs', () => {
    const feed = staticFeed('https://cdn.example.com/ta/')
    expect(feed.manifestUrl('latest.yml')).toBe('https://cdn.example.com/ta/latest.yml')
    expect(feed.assetUrl('0.2.0', 'https://mirror.example.com/a.exe')).toBe('https://mirror.example.com/a.exe')
  })

  it('reads electron-builder app-update.yml', () => {
    const github = feedFromAppUpdateConfig('owner: o\nrepo: r\nprovider: github\nupdaterCacheDirName: x\n')
    expect(github?.manifestUrl('latest.yml')).toBe('https://github.com/o/r/releases/latest/download/latest.yml')
    const generic = feedFromAppUpdateConfig('provider: generic\nurl: https://cdn.example.com/ta\n')
    expect(generic?.manifestUrl('latest.yml')).toBe('https://cdn.example.com/ta/latest.yml')
    expect(feedFromAppUpdateConfig('provider: s3\nbucket: b\n')).toBeNull()
  })
})

describe('macOS bundle location', () => {
  it('finds the bundle around the executable', () => {
    expect(macBundlePath('/Applications/TradingAgents.app/Contents/MacOS/TradingAgents')).toBe(
      '/Applications/TradingAgents.app'
    )
    expect(macBundlePath('/usr/local/bin/electron')).toBeNull()
  })

  it('spots App Translocation', () => {
    expect(isTranslocated('/private/var/folders/x/T/AppTranslocation/ABC/d/TradingAgents.app')).toBe(true)
    expect(isTranslocated('/Applications/TradingAgents.app')).toBe(false)
  })
})
