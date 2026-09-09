/**
 * Read the on-disk report tree the CLI and sidecar both write.
 *
 * Layout (tradingagents/reporting.py):
 *   <root>/<TICKER>_<YYYYMMDD_HHMMSS>/
 *     complete_report.md
 *     1_analysts/{market,sentiment,news,fundamentals}.md
 *     2_research/{bull,bear,manager}.md
 *     3_trading/trader.md
 *     4_risk/{aggressive,conservative,neutral}.md
 *     5_portfolio/decision.md
 *
 * A directory tree is enough to start; a database would buy nothing yet.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SectionKey } from '@shared/protocol'

export interface HistoryEntry {
  id: string
  ticker: string
  /** Local time the report tree was written. */
  savedAt: string
  path: string
}

export interface HistoryDetail extends HistoryEntry {
  completeReport: string
  sections: Partial<Record<SectionKey, string>>
}

/** `NVDA_20260908_185608` -> ticker + timestamp. */
const DIR_PATTERN = /^(?<ticker>.+)_(?<date>\d{8})_(?<time>\d{6})$/

const SECTION_FILES: [SectionKey, string][] = [
  ['market_report', '1_analysts/market.md'],
  ['sentiment_report', '1_analysts/sentiment.md'],
  ['news_report', '1_analysts/news.md'],
  ['fundamentals_report', '1_analysts/fundamentals.md'],
  ['investment_plan', '2_research/manager.md'],
  ['trader_investment_plan', '3_trading/trader.md'],
  ['final_trade_decision', '5_portfolio/decision.md']
]

function parseStamp(date: string, time: string): string {
  const iso =
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` +
    `T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
  return iso
}

export function listReports(root: string): HistoryEntry[] {
  if (!existsSync(root)) return []
  const entries: HistoryEntry[] = []
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    if (!statSync(path).isDirectory()) continue
    const match = DIR_PATTERN.exec(name)
    if (!match?.groups) continue
    entries.push({
      id: name,
      ticker: match.groups.ticker,
      savedAt: parseStamp(match.groups.date, match.groups.time),
      path
    })
  }
  // Newest first: the run a user wants is almost always the last one.
  return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export function readReport(root: string, id: string): HistoryDetail | null {
  const entry = listReports(root).find((candidate) => candidate.id === id)
  if (!entry) return null
  const read = (relative: string): string | undefined => {
    const file = join(entry.path, relative)
    return existsSync(file) ? readFileSync(file, 'utf-8') : undefined
  }
  const sections: Partial<Record<SectionKey, string>> = {}
  for (const [key, relative] of SECTION_FILES) {
    const content = read(relative)
    if (content !== undefined) sections[key] = content
  }
  return { ...entry, completeReport: read('complete_report.md') ?? '', sections }
}

/** Directory name the sidecar should write this run into. */
export function reportDirName(ticker: string, when: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}_` +
    `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`
  return `${ticker}_${stamp}`
}
