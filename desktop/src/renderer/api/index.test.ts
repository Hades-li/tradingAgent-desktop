import { describe, expect, it } from 'vitest'
import { belongsTo, symbolSearch, toItem, type YahooQuote } from './index'

function quote(symbol: string, quoteType = 'EQUITY', exchange = 'NMS', extra: YahooQuote = {}) {
  return { symbol, quoteType, exchange, ...extra }
}

describe('belongsTo', () => {
  const quotes = [
    quote('0700.HK', 'EQUITY', 'HKG'),
    quote('TCEHY', 'EQUITY', 'PNK'),
    quote('600519.SS', 'EQUITY', 'SHH'),
    quote('AAPL'),
    quote('AAPL=F', 'FUTURE', 'CME'),
    quote('BTC-USD', 'CRYPTOCURRENCY', 'CCC'),
    quote('BTC-EUR', 'CRYPTOCURRENCY', 'CCC')
  ]
  const symbolsFor = (market: Parameters<typeof belongsTo>[0]): string[] =>
    quotes.filter((item) => belongsTo(market, item)).map((item) => item.symbol)

  it('narrows quotes to the market', () => {
    expect(symbolsFor('hk')).toEqual(['0700.HK'])
    expect(symbolsFor('cn')).toEqual(['600519.SS'])
    expect(symbolsFor('us')).toEqual(['AAPL'])
  })

  it('keeps only crypto pairs a run can fetch', () => {
    expect(symbolsFor('crypto')).toEqual(['BTC-USD'])
  })
})

describe('toItem', () => {
  it('maps a Yahoo quote and falls back across name fields', () => {
    expect(
      toItem(quote('NVDA', 'EQUITY', 'NMS', { shortname: 'NVIDIA', regularMarketPrice: 1.5 }))
    ).toEqual({
      symbol: 'NVDA',
      name: 'NVIDIA',
      exchange: 'NMS',
      currency: null,
      price: 1.5,
      changePercent: null,
      marketCap: null
    })
    expect(toItem({ symbol: 'X' }).name).toBe('X')
  })
})

describe('symbolSearch', () => {
  it('does not hit the network for a blank query', async () => {
    await expect(symbolSearch('us', '   ')).resolves.toEqual([])
  })
})
