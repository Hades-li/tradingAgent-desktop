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
import { useSettingsStore } from '@renderer/store/settingsStore'
import { ANALYST_LABELS } from '@shared/labels'
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
  const settings = useSettingsStore((state) => state.settings)
  const [ticker, setTicker] = useState('NVDA')
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
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const valid = ticker.trim().length > 0 && dateValid && analysts.length > 0

  const toggle = (key: AnalystKey): void =>
    setAnalysts((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    )

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto p-6">
      <FieldGroup>
        <FieldSet>
          <FieldLegend>新建分析</FieldLegend>
          <FieldGroup className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="ticker">标的代码</FieldLabel>
              <Input
                id="ticker"
                value={ticker}
                placeholder="NVDA / 0700.HK / BTC-USD"
                onChange={(event) => setTicker(event.target.value)}
              />
              <FieldDescription>已识别为 {isCrypto ? '加密货币' : '股票'}管线</FieldDescription>
            </Field>
            <Field data-invalid={!dateValid || undefined}>
              <FieldLabel htmlFor="date">分析日期</FieldLabel>
              <Input
                id="date"
                type="date"
                value={date}
                aria-invalid={!dateValid}
                onChange={(event) => setDate(event.target.value)}
              />
              <FieldDescription>历史日期会启用前视数据过滤</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">分析师团队</FieldLegend>
          <FieldDescription>至少选择一项；未选中的分析师不会进入流水线。</FieldDescription>
          <FieldGroup className="grid grid-cols-2 gap-2">
            {ANALYST_KEYS.map((key) => (
              <Field key={key} orientation="horizontal">
                <Checkbox
                  id={`analyst-${key}`}
                  checked={analysts.includes(key)}
                  onCheckedChange={() => toggle(key)}
                />
                <FieldLabel htmlFor={`analyst-${key}`} className="font-normal">
                  {ANALYST_LABELS[key]}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>

        <FieldGroup className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="depth">研究深度 · {rounds} 轮辩论</FieldLabel>
            <Slider
              id="depth"
              min={1}
              max={5}
              step={1}
              value={rounds}
              onValueChange={(value) => setRounds(value as number)}
            />
            <FieldDescription>对应 max_debate_rounds / max_risk_discuss_rounds</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="language">输出语言</FieldLabel>
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
            <FieldDescription>内部辩论固定英文以保证推理质量</FieldDescription>
          </Field>
        </FieldGroup>

        <Field orientation="horizontal">
          <Switch id="checkpoint" checked={checkpoint} onCheckedChange={setCheckpoint} />
          <FieldContent>
            <FieldTitle>启用断点续跑</FieldTitle>
            <FieldDescription>崩溃后可从最后一个成功节点恢复</FieldDescription>
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
            开始分析
          </Button>
          <FieldDescription>
            使用提供方 {settings.llmProvider} · {analysts.length + 8} 个 agent
          </FieldDescription>
        </Field>
      </FieldGroup>
    </div>
  )
}
