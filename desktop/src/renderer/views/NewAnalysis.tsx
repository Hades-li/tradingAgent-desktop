/**
 * Run form. Numeric fields are constrained here on purpose: an invalid
 * TRADINGAGENTS_* value makes Python raise during import, long before any event
 * is emitted, and that traceback means nothing to a user.
 */

import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { ANALYST_LABELS } from '@shared/labels'
import { ANALYST_KEYS, type AnalystKey } from '@shared/protocol'
import { useSettingsStore } from '@renderer/store/settingsStore'

const CRYPTO_SUFFIXES = ['-USD', '-USDT', '-USDC', '-BTC', '-ETH']

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
  const valid = ticker.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && analysts.length > 0

  const toggle = (key: AnalystKey): void =>
    setAnalysts((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <h3 className="text-[15px] font-semibold">新建分析</h3>

      <div className="grid grid-cols-2 gap-4">
        <Field label="标的代码" hint={`已识别为 ${isCrypto ? '加密货币' : '股票'}管线`}>
          <input
            className="field"
            value={ticker}
            onChange={(event) => setTicker(event.target.value)}
            placeholder="NVDA / 0700.HK / BTC-USD"
          />
        </Field>
        <Field label="分析日期" hint="历史日期会启用前视数据过滤">
          <input
            className="field"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
      </div>

      <Field label="分析师团队" hint="至少选择一项">
        <div className="flex flex-wrap gap-3 pt-1">
          {ANALYST_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={analysts.includes(key)}
                onChange={() => toggle(key)}
              />
              <span>{ANALYST_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={`研究深度 · ${rounds} 轮辩论`} hint="对应 max_debate_rounds / max_risk_discuss_rounds">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={rounds}
            onChange={(event) => setRounds(Number(event.target.value))}
            className="w-full"
          />
        </Field>
        <Field label="输出语言" hint="内部辩论固定英文以保证推理质量">
          <select
            className="field"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="中文">中文</option>
            <option value="English">English</option>
          </select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={checkpoint}
          onChange={(event) => setCheckpoint(event.target.checked)}
        />
        <span>启用断点续跑</span>
        <span className="text-muted">崩溃后可从最后一个成功节点恢复</span>
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
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
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-white disabled:opacity-40"
        >
          <Play size={13} />
          开始分析
        </button>
        <span className="text-[12px] text-muted">
          使用提供方 <code>{settings.llmProvider}</code> · {analysts.length + 8} 个 agent
        </span>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  )
}
