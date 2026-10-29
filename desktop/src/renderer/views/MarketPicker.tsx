/**
 * Symbol picker: one page of the largest names per market, plus Yahoo symbol
 * search narrowed to the same market. Picking a symbol hands it to the run
 * form rather than starting a run, because a run spends model credits.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCw, Search, SearchX, X } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@renderer/components/ui/input-group'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@renderer/components/ui/item'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import { MARKET_KEYS, type MarketItem, type MarketKey } from '@shared/protocol'

const SEARCH_DELAY_MS = 300
const SKELETON_ROWS = 8

interface Result {
  key: string
  items: MarketItem[]
  error: string | null
}

interface Props {
  onAnalyze: (symbol: string) => void
}

function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function safeFormat(locale: string, options: Intl.NumberFormatOptions, value: number): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value)
  } catch {
    const { style: _style, currency: _currency, ...rest } = options
    return new Intl.NumberFormat(locale, rest).format(value)
  }
}

function formatPrice(item: MarketItem, locale: string): string | null {
  if (item.price === null) return null
  const precision: Intl.NumberFormatOptions =
    Math.abs(item.price) < 1 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: 2 }
  const currency: Intl.NumberFormatOptions = item.currency
    ? { style: 'currency', currency: item.currency }
    : {}
  return safeFormat(locale, { ...currency, ...precision }, item.price)
}

function formatChange(item: MarketItem, locale: string): string | null {
  if (item.changePercent === null) return null
  return safeFormat(
    locale,
    { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' },
    item.changePercent / 100
  )
}

function formatMarketCap(item: MarketItem, locale: string): string | null {
  if (item.marketCap === null) return null
  const currency: Intl.NumberFormatOptions = item.currency
    ? { style: 'currency', currency: item.currency }
    : {}
  return safeFormat(
    locale,
    { ...currency, notation: 'compact', maximumFractionDigits: 2 },
    item.marketCap
  )
}

export function MarketPicker({ onAnalyze }: Props): React.JSX.Element {
  const { t, i18n } = useTranslation('market')
  const [market, setMarket] = useState<MarketKey>('us')
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<MarketItem | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const search = useDebouncedValue(query.trim(), SEARCH_DELAY_MS)
  const requestKey = `${market}|${search}|${attempt}`
  const loading = result?.key !== requestKey
  const items = loading ? [] : result.items
  const locale = i18n.language

  useEffect(() => {
    let active = true
    const request = search
      ? window.desktop.market.search(market, search)
      : window.desktop.market.list(market)
    request.then(
      (payload) => {
        if (active) setResult({ key: requestKey, items: payload.items, error: null })
      },
      (error: unknown) => {
        if (active) setResult({ key: requestKey, items: [], error: errorText(error) })
      }
    )
    return () => {
      active = false
    }
  }, [requestKey, market, search])

  const changeMarket = (value: MarketKey): void => {
    setMarket(value)
    setSelected(null)
  }

  return (
    <Tabs
      value={market}
      onValueChange={(value) => changeMarket(value as MarketKey)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <span className="font-medium">{t('title')}</span>
        <TabsList>
          {MARKET_KEYS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex flex-col gap-1.5 border-b px-4 py-3">
        <InputGroup>
          <InputGroupInput
            value={query}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={t('clearSearch')}
                onClick={() => setQuery('')}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <p className="text-muted-foreground text-xs">{t('searchHint')}</p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-3">
          {!loading && !result.error && items.length > 0 && (
            <p className="text-muted-foreground px-1 text-xs">
              {search
                ? t('searchCaption', { query: search })
                : t('listCaption', { total: items.length })}
            </p>
          )}

          {loading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          )}

          {!loading && result.error && (
            <Alert variant="destructive">
              <AlertTitle>{t('loadFailed')}</AlertTitle>
              <AlertDescription>{result.error}</AlertDescription>
              <AlertAction>
                <Button size="xs" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                  <RotateCw data-icon="inline-start" />
                  {t('retry')}
                </Button>
              </AlertAction>
            </Alert>
          )}

          {!loading && !result.error && items.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle>{search ? t('emptySearch') : t('emptyList')}</EmptyTitle>
                {search && <EmptyDescription>{t('emptySearchHint')}</EmptyDescription>}
              </EmptyHeader>
            </Empty>
          )}

          {items.length > 0 && (
            <div role="listbox" aria-label={t('title')} className="flex flex-col gap-1">
              {items.map((item) => {
                const isSelected = selected?.symbol === item.symbol
                const price = formatPrice(item, locale)
                const change = formatChange(item, locale)
                const marketCap = formatMarketCap(item, locale)
                return (
                  <Item
                    key={item.symbol}
                    size="sm"
                    variant={isSelected ? 'outline' : 'default'}
                    role="option"
                    aria-selected={isSelected}
                    render={<button type="button" />}
                    className={cn(
                      'hover:bg-muted/60 cursor-pointer flex-nowrap text-left',
                      isSelected && 'bg-muted border-primary/40'
                    )}
                    onClick={() => setSelected(item)}
                    onDoubleClick={() => onAnalyze(item.symbol)}
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle>
                        {item.symbol}
                        {item.exchange && <Badge variant="outline">{item.exchange}</Badge>}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-1">{item.name}</ItemDescription>
                    </ItemContent>
                    {price && (
                      <div className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
                        <span className="text-sm font-medium">{price}</span>
                        <span className="text-muted-foreground text-xs">
                          {[change, marketCap && t('marketCap', { value: marketCap })]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                  </Item>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-3 border-t px-4 py-3">
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
          {selected
            ? `${t('selected', { symbol: selected.symbol })} · ${selected.name}`
            : t('noSelection')}
        </span>
        <Button disabled={!selected} onClick={() => selected && onAnalyze(selected.symbol)}>
          <Play data-icon="inline-start" />
          {t('analyze')}
        </Button>
      </div>
    </Tabs>
  )
}
