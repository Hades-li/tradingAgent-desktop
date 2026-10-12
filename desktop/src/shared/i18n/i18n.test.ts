import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { domainLabel } from '../labels'
import { createI18n, RESOURCES } from './index'
import { LOCALES, resolveLocale } from './locales'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function flatten(tree: object, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') entries.set(path, value)
    else for (const [nested, text] of flatten(value, path)) entries.set(nested, text)
  }
  return entries
}

function keysOf(tree: object): string[] {
  return [...new Set([...flatten(tree).keys()].map((key) => key.replace(PLURAL_SUFFIX, '')))].sort()
}

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort()
}

describe('locale resources', () => {
  const [reference, ...others] = LOCALES.map((locale) => locale.code)

  it.each(others)('%s has the same keys as the reference locale', (code) => {
    expect(keysOf(RESOURCES[code])).toEqual(keysOf(RESOURCES[reference]))
  })

  it.each(LOCALES.map((locale) => locale.code))('%s has no empty text', (code) => {
    for (const [key, text] of flatten(RESOURCES[code])) {
      expect(text.trim(), key).not.toBe('')
    }
  })

  it.each(others)('%s uses the same placeholders as the reference locale', (code) => {
    const base = flatten(RESOURCES[reference])
    for (const [key, text] of flatten(RESOURCES[code])) {
      const baseKey = base.has(key) ? key : key.replace(PLURAL_SUFFIX, '_other')
      const baseText = base.get(baseKey)
      if (baseText !== undefined) {
        expect(placeholdersOf(text), `${code}:${key}`).toEqual(placeholdersOf(baseText))
      }
    }
  })
})

describe('resolveLocale', () => {
  it('honours an explicit choice over the system locale', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN')
  })

  it('maps a system locale onto a supported language', () => {
    expect(resolveLocale('system', 'zh-CN')).toBe('zh-CN')
    expect(resolveLocale('system', 'zh-TW')).toBe('zh-CN')
    expect(resolveLocale('system', 'en-GB')).toBe('en')
  })

  it('falls back to English for an unsupported language or unknown preference', () => {
    expect(resolveLocale('system', 'fr-FR')).toBe('en')
    expect(resolveLocale('klingon', 'fr-FR')).toBe('en')
  })
})

describe('translation', () => {
  it('translates domain values per language and falls back to the raw name', () => {
    const zh = createI18n('zh-CN').getFixedT('zh-CN', 'domain')
    const en = createI18n('en').getFixedT('en', 'domain')
    expect(domainLabel(zh, 'rating', 'Underweight')).toBe('减持')
    expect(domainLabel(en, 'ratingShort', 'Underweight')).toBe('U/W')
    expect(domainLabel(zh, 'agent', 'Unknown Agent')).toBe('Unknown Agent')
  })

  it('nests the translated rating into the run log', () => {
    const zh = createI18n('zh-CN')
    const en = createI18n('en')
    expect(zh.t('dashboard:log.finished', { rating: 'Sell' })).toBe('分析完成 · 卖出')
    expect(en.t('dashboard:log.finished', { rating: 'Overweight' })).toBe(
      'Analysis finished · Overweight'
    )
  })

  it('pluralises where the language needs it', () => {
    const en = createI18n('en')
    expect(en.t('sidebar:keyCount', { count: 1 })).toBe('1 key')
    expect(en.t('sidebar:keyCount', { count: 3 })).toBe('3 keys')
    expect(createI18n('zh-CN').t('sidebar:keyCount', { count: 3 })).toBe('3 个密钥')
  })
})

describe('hard-coded text', () => {
  const root = join(import.meta.dirname, '../../renderer')
  const CJK = /[一-龥]/

  function sources(directory: string): string[] {
    return readdirSync(directory).flatMap((name) => {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
    })
  }

  it('keeps Chinese out of the renderer sources apart from output-language values', () => {
    const offenders = sources(root).flatMap((file) =>
      readFileSync(file, 'utf-8')
        .split('\n')
        .map((line, index) => ({ file, line, number: index + 1 }))
        .filter(({ line }) => CJK.test(line) && !line.includes("value: '中文'"))
        .map(({ file: path, number }) => `${path}:${number}`)
    )
    expect(offenders).toEqual([])
  })
})
