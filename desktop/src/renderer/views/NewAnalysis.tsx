/**
 * Run form. Numeric fields are constrained here on purpose: an invalid
 * TRADINGAGENTS_* value makes Python raise during import, long before any event
 * is emitted, and that traceback means nothing to a user.
 */

import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldContent,
  FieldLegend,
  FieldSet,
  FieldTitle
} from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useDomain } from '@renderer/i18n'
import { ANALYST_KEYS, type AnalystKey } from '@shared/protocol'

const CRYPTO_SUFFIXES = ['-USD', '-USDT', '-USDC', '-BTC', '-ETH']

const LANGUAGES = [
  { label: '中文', value: '中文' },
  { label: 'English', value: 'English' }
]

function today(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

interface Props {
  onStart: (input: {
    ticker: string
    date: string
    analysts: AnalystKey[]
    debateRounds: number
    outputLanguage: string
    checkpointEnabled: boolean
  }) => void
  busy: boolean
}

export function NewAnalysis({ onStart, busy }: Props): React.JSX.Element {
  const { t } = useTranslation('analysis')
  const domain = useDomain()
  const settings = useSettingsStore((state) => state.settings)
  const [ticker, setTicker] = useState('')
  const [date, setDate] = useState(today())
  const [analysts, setAnalysts] = useState<AnalystKey[]>(settings.defaultAnalysts)
  const [rounds, setRounds] = useState(settings.maxDebateRounds)
  const [language, setLanguage] = useState(settings.outputLanguage)
  const [checkpoint, setCheckpoint] = useState(settings.checkpointEnabled)

  // Mirrors the Python-side detection so the hint matches the pipeline used.
  const isCrypto = useMemo(
    () => CRYPTO_SUFFIXES.some((suffix) => ticker.trim().toUpperCase().endsWith(suffix)),
    [ticker]
  )
  const hasTicker = ticker.trim().length > 0
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const valid = hasTicker && dateValid && analysts.length > 0

  const toggle = (key: AnalystKey): void =>
    setAnalysts((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    )

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-6">
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t('title')}</FieldLegend>
          <FieldGroup className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="ticker">{t('ticker')}</FieldLabel>
              <Input
                id="ticker"
                value={ticker}
                placeholder="NVDA / 0700.HK / BTC-USD"
                autoFocus
                onChange={(event) => setTicker(event.target.value)}
              />
              <FieldDescription>
                {t(hasTicker ? (isCrypto ? 'tickerHint.crypto' : 'tickerHint.stock') : 'tickerHint.empty')}
              </FieldDescription>
            </Field>
            <Field data-invalid={!dateValid || undefined}>
              <FieldLabel htmlFor="date">{t('date')}</FieldLabel>
              <Input
                id="date"
                type="date"
                value={date}
                aria-invalid={!dateValid}
                onChange={(event) => setDate(event.target.value)}
              />
              <FieldDescription>{t('dateHint')}</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">{t('analysts')}</FieldLegend>
          <FieldDescription>{t('analystsHint')}</FieldDescription>
          <FieldGroup className="grid grid-cols-2 gap-2">
            {ANALYST_KEYS.map((key) => (
              <Field key={key} orientation="horizontal">
                <Checkbox
                  id={`analyst-${key}`}
                  checked={analysts.includes(key)}
                  onCheckedChange={() => toggle(key)}
                />
                <FieldLabel htmlFor={`analyst-${key}`} className="font-normal">
                  {domain.analyst(key)}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>

        <FieldGroup className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="depth">{t('depth', { rounds })}</FieldLabel>
            <Slider
              id="depth"
              min={1}
              max={5}
              step={1}
              value={rounds}
              onValueChange={(value) => setRounds(value as number)}
            />
            <FieldDescription>{t('depthHint')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="language">{t('outputLanguage')}</FieldLabel>
            <Select
              items={LANGUAGES}
              value={language}
              onValueChange={(value) => setLanguage(value as string)}
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t('outputLanguageHint')}</FieldDescription>
          </Field>
        </FieldGroup>

        <Field orientation="horizontal">
          <Switch id="checkpoint" checked={checkpoint} onCheckedChange={setCheckpoint} />
          <FieldContent>
            <FieldTitle>{t('checkpoint')}</FieldTitle>
            <FieldDescription>{t('checkpointHint')}</FieldDescription>
          </FieldContent>
        </Field>

        <Field orientation="horizontal">
          <Button
            disabled={!valid || busy}
            onClick={() =>
              onStart({
                ticker: ticker.trim().toUpperCase(),
                date,
                analysts,
                debateRounds: rounds,
                outputLanguage: language,
                checkpointEnabled: checkpoint
              })
            }
          >
            <Play />
            {t('start')}
          </Button>
          <FieldDescription>
            {t('summary', { provider: settings.llmProvider, count: analysts.length + 8 })}
          </FieldDescription>
        </Field>
      </FieldGroup>
    </div>
  )
}
