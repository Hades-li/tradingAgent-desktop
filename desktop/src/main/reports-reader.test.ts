import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listReports, readReport, reportDirName } from './reports-reader'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'ta-reports-'))
  const older = join(root, 'NVDA_20260908_185608')
  mkdirSync(join(older, '1_analysts'), { recursive: true })
  writeFileSync(join(older, 'complete_report.md'), '# NVDA')
  writeFileSync(join(older, '1_analysts', 'market.md'), '# market')
  const newer = join(root, 'BTC-USD_20260909_090000')
  mkdirSync(newer, { recursive: true })
  writeFileSync(join(newer, 'complete_report.md'), '# BTC')
  mkdirSync(join(root, 'not-a-run'), { recursive: true })
  return root
}

describe('listReports', () => {
  it('returns newest first and skips unrecognised directories', () => {
    const entries = listReports(fixture())
    expect(entries.map((entry) => entry.ticker)).toEqual(['BTC-USD', 'NVDA'])
    expect(entries[1].savedAt).toBe('2026-09-08T18:56:08')
  })

  it('tolerates a missing reports root', () => {
    expect(listReports('/definitely/not/here')).toEqual([])
  })
})

describe('readReport', () => {
  it('reads the consolidated report and the per-section files present', () => {
    const root = fixture()
    const detail = readReport(root, 'NVDA_20260908_185608')
    expect(detail?.completeReport).toBe('# NVDA')
    expect(detail?.sections.market_report).toBe('# market')
    expect(detail?.sections.news_report).toBeUndefined()
  })

  it('returns null for an unknown id', () => {
    expect(readReport(fixture(), 'nope')).toBeNull()
  })
})

describe('reportDirName', () => {
  it('matches the CLI naming scheme', () => {
    expect(reportDirName('NVDA', new Date(2026, 8, 9, 1, 2, 3))).toBe('NVDA_20260909_010203')
  })
})
