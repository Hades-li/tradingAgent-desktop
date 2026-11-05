/**
 * Market data for the symbol picker, read straight from Yahoo Finance in the
 * renderer. Yahoo is also the analysis engine's default data vendor, so every
 * symbol offered here is one a run can actually fetch.
 *
 * Yahoo sends no CORS headers. The packaged app loads from file://, which
 * Chromium does not CORS-check; in dev the main process answers CORS for
 * Yahoo on the dev server's behalf (see allowYahooFromDevServer).
 */

import axios, { isAxiosError } from 'axios'
import { TtlCache } from '@renderer/lib/ttl-cache'

export const MARKET_KEYS = ['us', 'crypto', 'hk', 'cn'] as const
export type MarketKey = (typeof MARKET_KEYS)[number]

export interface MarketItem {
  symbol: string
  name: string
  exchange: string | null
  currency: string | null
  price: number | null
  changePercent: number | null
  marketCap: number | null
}

export interface YahooQuote {
  symbol?: string
  quoteType?: string
  exchange?: string
  fullExchangeName?: string
  exchDisp?: string
  shortName?: string
  longName?: string
  shortname?: string
  longname?: string
  currency?: string
  regularMarketPrice?: number
  regularMarketChangePercent?: number
  marketCap?: number
}

interface ScreenerResponse {
  finance: { result: { quotes?: YahooQuote[] }[] | null }
}

interface SearchResponse {
  quotes?: YahooQuote[]
}

interface QuoteResponse {
  quoteResponse: { result: YahooQuote[] | null }
}

const LIST_SIZE = 50
const SEARCH_SIZE = 25
const LIST_TTL_MS = 5 * 60 * 1000

const US_EXCHANGES = ['NMS', 'NYQ', 'NGM', 'NCM', 'ASE']
const CN_EXCHANGES = ['SHH', 'SHZ']
const TRADABLE_TYPES = ['EQUITY', 'ETF']
const CRYPTO_SCREEN = 'all_cryptocurrencies_us'
/** Mirrors tradingagents.asset_type.CRYPTO_SUFFIXES: the pairs a run can fetch. */
const CRYPTO_SUFFIXES = ['-USD', '-USDT', '-USDC', '-BTC', '-ETH']

/** Yahoo needs its own cookie on every call, hence withCredentials. */
const query1 = axios.create({
  baseURL: 'https://query1.finance.yahoo.com',
  withCredentials: true,
  timeout: 15_000
})
const query2 = axios.create({
  baseURL: 'https://query2.finance.yahoo.com',
  withCredentials: true,
  timeout: 15_000
})

const SCREENER_PARAMS = { formatted: false }
const ENGLISH_PARAMS = { lang: 'en-US', region: 'US' }
const CHINESE_PARAMS = { lang: 'zh-CN', region: 'CN' }

/** Markets where a bare numeric code says little, so the picker leads with the name. */
export const NAME_FIRST_MARKETS: readonly MarketKey[] = ['hk', 'cn']

/** Yahoo carries Chinese names for these markets in `longName` when asked in zh-CN. */
export function usesChineseNames(market: MarketKey, locale: string): boolean {
  return NAME_FIRST_MARKETS.includes(market) && locale.startsWith('zh')
}

function localeParams(market: MarketKey, locale: string): Record<string, string> {
  return usesChineseNames(market, locale) ? CHINESE_PARAMS : ENGLISH_PARAMS
}

/** True when a Yahoo quote is something the picker should list under `market`. */
export function belongsTo(market: MarketKey, quote: YahooQuote): boolean {
  const symbol = quote.symbol ?? ''
  if (market === 'crypto') {
    return (
      quote.quoteType === 'CRYPTOCURRENCY' &&
      CRYPTO_SUFFIXES.some((suffix) => symbol.endsWith(suffix))
    )
  }
  if (!TRADABLE_TYPES.includes(quote.quoteType ?? '')) return false
  if (market === 'hk') return symbol.endsWith('.HK')
  if (market === 'cn') return symbol.endsWith('.SS') || symbol.endsWith('.SZ')
  return US_EXCHANGES.includes(quote.exchange ?? '')
}

/**
 * With `chineseNames`, `longName` holds the Chinese name while `shortName` stays an
 * English abbreviation; NFKC folds the full-width letters Yahoo uses in suffixes like -W.
 */
export function toItem(quote: YahooQuote, chineseNames = false): MarketItem {
  const symbol = quote.symbol ?? ''
  const name = chineseNames
    ? (quote.longName || quote.shortName || quote.longname || quote.shortname || symbol).normalize(
        'NFKC'
      )
    : quote.shortName || quote.longName || quote.shortname || quote.longname || symbol
  return {
    symbol,
    name,
    exchange: quote.fullExchangeName || quote.exchDisp || quote.exchange || null,
    currency: quote.currency ?? null,
    price: quote.regularMarketPrice ?? null,
    changePercent: quote.regularMarketChangePercent ?? null,
    marketCap: quote.marketCap ?? null
  }
}

function isUnauthorized(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 401
}

let crumbRequest: Promise<string> | null = null

/** The equity screener rejects requests without a crumb bound to Yahoo's A3 cookie. */
async function fetchCrumb(): Promise<string> {
  // fc.yahoo.com answers 404, but the response sets the cookie the crumb needs.
  await axios.get('https://fc.yahoo.com', { withCredentials: true, validateStatus: () => true })
  const { data } = await query1.get<string>('/v1/test/getcrumb', { responseType: 'text' })
  if (!data) throw new Error('Yahoo Finance returned an empty crumb')
  return data
}

function crumb(): Promise<string> {
  crumbRequest ??= fetchCrumb().catch((error: unknown) => {
    crumbRequest = null
    throw error
  })
  return crumbRequest
}

function equityQuery(market: Exclude<MarketKey, 'crypto'>): Record<string, unknown> {
  if (market === 'hk') return { operator: 'EQ', operands: ['region', 'hk'] }
  const exchanges = market === 'cn' ? CN_EXCHANGES : US_EXCHANGES
  return {
    operator: 'OR',
    operands: exchanges.map((exchange) => ({ operator: 'EQ', operands: ['exchange', exchange] }))
  }
}

/** Runs a crumb-bound request, fetching a fresh crumb once if Yahoo rejects the old one. */
async function withCrumb<Value>(request: (crumb: string) => Promise<Value>): Promise<Value> {
  try {
    return await request(await crumb())
  } catch (error) {
    // A crumb outlives its cookie only so long; fetch a fresh pair once.
    if (!isUnauthorized(error)) throw error
    crumbRequest = null
    return request(await crumb())
  }
}

async function screenEquities(
  market: Exclude<MarketKey, 'crypto'>,
  locale: string
): Promise<YahooQuote[]> {
  const body = {
    offset: 0,
    size: LIST_SIZE,
    sortField: 'intradaymarketcap',
    sortType: 'DESC',
    quoteType: 'EQUITY',
    userId: '',
    userIdType: 'guid',
    query: equityQuery(market)
  }
  return withCrumb(async (crumb) => {
    const { data } = await query1.post<ScreenerResponse>('/v1/finance/screener', body, {
      params: { ...SCREENER_PARAMS, ...localeParams(market, locale), crumb }
    })
    return data.finance.result?.[0]?.quotes ?? []
  })
}

/** Yahoo's predefined crypto screen has no paging, so this is the largest page it gives. */
async function screenCrypto(): Promise<YahooQuote[]> {
  const { data } = await query1.get<ScreenerResponse>('/v1/finance/screener/predefined/saved', {
    params: { ...SCREENER_PARAMS, ...ENGLISH_PARAMS, scrIds: CRYPTO_SCREEN, count: LIST_SIZE }
  })
  return data.finance.result?.[0]?.quotes ?? []
}

/** Full quotes for `symbols`, in Chinese; search results alone carry only English names. */
async function chineseQuotes(symbols: string[]): Promise<YahooQuote[]> {
  return withCrumb(async (crumb) => {
    const { data } = await query1.get<QuoteResponse>('/v7/finance/quote', {
      params: { symbols: symbols.join(','), ...CHINESE_PARAMS, crumb }
    })
    return data.quoteResponse.result ?? []
  })
}

const marketLists = new TtlCache<string, MarketItem[]>(LIST_TTL_MS)

/** The largest names in `market` by market cap. Cached briefly so tab switches stay instant. */
export async function marketList(market: MarketKey, locale = 'en'): Promise<MarketItem[]> {
  const chineseNames = usesChineseNames(market, locale)
  const cacheKey = `${market}|${chineseNames ? 'zh' : 'en'}`
  const cached = marketLists.get(cacheKey)
  if (cached) return cached
  const quotes = market === 'crypto' ? await screenCrypto() : await screenEquities(market, locale)
  const items = quotes
    .filter((quote) => belongsTo(market, quote))
    .map((quote) => toItem(quote, chineseNames))
  marketLists.set(cacheKey, items)
  return items
}

/**
 * Yahoo symbol search narrowed to `market`. Plain search results carry no prices;
 * where Chinese names apply they are swapped for full quotes, falling back to the
 * plain results if that lookup fails, since names are not worth failing a search.
 */
export async function symbolSearch(
  market: MarketKey,
  query: string,
  locale = 'en'
): Promise<MarketItem[]> {
  const text = query.trim()
  if (!text) return []
  const { data } = await query2.get<SearchResponse>('/v1/finance/search', {
    params: {
      q: text,
      quotesCount: SEARCH_SIZE,
      newsCount: 0,
      listsCount: 0,
      enableFuzzyQuery: true,
      quotesQueryId: 'tss_match_phrase_query'
    }
  })
  const matches = (data.quotes ?? []).filter((quote) => quote.symbol && belongsTo(market, quote))
  if (!usesChineseNames(market, locale) || matches.length === 0) {
    return matches.map((quote) => toItem(quote))
  }
  try {
    const quotes = await chineseQuotes(matches.map((quote) => quote.symbol ?? ''))
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]))
    return matches.map((quote) => toItem(bySymbol.get(quote.symbol) ?? quote, true))
  } catch {
    return matches.map((quote) => toItem(quote))
  }
}
