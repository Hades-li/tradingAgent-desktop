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

const SCREENER_PARAMS = { formatted: false, lang: 'en-US', region: 'US' }

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

export function toItem(quote: YahooQuote): MarketItem {
  const symbol = quote.symbol ?? ''
  return {
    symbol,
    name: quote.shortName || quote.longName || quote.shortname || quote.longname || symbol,
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

async function screenEquities(market: Exclude<MarketKey, 'crypto'>): Promise<YahooQuote[]> {
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
  const post = async (): Promise<YahooQuote[]> => {
    const { data } = await query1.post<ScreenerResponse>('/v1/finance/screener', body, {
      params: { ...SCREENER_PARAMS, crumb: await crumb() }
    })
    return data.finance.result?.[0]?.quotes ?? []
  }
  try {
    return await post()
  } catch (error) {
    // A crumb outlives its cookie only so long; fetch a fresh pair once.
    if (!isUnauthorized(error)) throw error
    crumbRequest = null
    return post()
  }
}

/** Yahoo's predefined crypto screen has no paging, so this is the largest page it gives. */
async function screenCrypto(): Promise<YahooQuote[]> {
  const { data } = await query1.get<ScreenerResponse>('/v1/finance/screener/predefined/saved', {
    params: { ...SCREENER_PARAMS, scrIds: CRYPTO_SCREEN, count: LIST_SIZE }
  })
  return data.finance.result?.[0]?.quotes ?? []
}

const marketLists = new TtlCache<MarketKey, MarketItem[]>(LIST_TTL_MS)

/** The largest names in `market` by market cap. Cached briefly so tab switches stay instant. */
export async function marketList(market: MarketKey): Promise<MarketItem[]> {
  const cached = marketLists.get(market)
  if (cached) return cached
  const quotes = market === 'crypto' ? await screenCrypto() : await screenEquities(market)
  const items = quotes.filter((quote) => belongsTo(market, quote)).map(toItem)
  marketLists.set(market, items)
  return items
}

/** Yahoo symbol search narrowed to `market`; search results carry no prices. */
export async function symbolSearch(market: MarketKey, query: string): Promise<MarketItem[]> {
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
  return (data.quotes ?? [])
    .filter((quote) => quote.symbol && belongsTo(market, quote))
    .map(toItem)
}
