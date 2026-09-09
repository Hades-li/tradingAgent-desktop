/**
 * Four groups, matching the prototype: provider + keys, models + reasoning,
 * data vendors, run defaults. Every field is annotated with the environment
 * variable it maps to so a user can cross-check against `.env` or the CLI.
 */

import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { CUSTOM_ENDPOINT_PROVIDERS } from '@shared/settings'
import { useSettingsStore } from '@renderer/store/settingsStore'

type Tab = 'provider' | 'model' | 'data' | 'run'

const TABS: { id: Tab; label: string }[] = [
  { id: 'provider', label: '提供方与密钥' },
  { id: 'model', label: '模型与推理' },
  { id: 'data', label: '数据源' },
  { id: 'run', label: '运行默认值' }
]

const VENDOR_LABELS: Record<string, string> = {
  core_stock_apis: '行情接口',
  technical_indicators: '技术指标',
  fundamental_data: '基本面',
  news_data: '新闻',
  macro_data: '宏观',
  prediction_markets: '预测市场'
}

export function SettingsView(): React.JSX.Element {
  const { settings, options, keyStatus, optionsError, update, save, setKey, clearKey } =
    useSettingsStore()
  const [tab, setTab] = useState<Tab>('provider')
  const [saved, setSaved] = useState(false)

  const provider = options?.providers.find((item) => item.id === settings.llmProvider)
  const showEndpoint = CUSTOM_ENDPOINT_PROVIDERS.includes(settings.llmProvider)

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 1800)
    return () => clearTimeout(timer)
  }, [saved])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2">
        <strong className="text-[14px]">模型配置</strong>
        <nav className="flex gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-2 py-[2px] text-[12px] ${
                tab === item.id ? 'bg-accent text-white' : 'text-muted hover:bg-panel2'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {optionsError && (
          <p className="mb-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
            无法读取模型目录：{optionsError}
          </p>
        )}

        {tab === 'provider' && (
          <div className="flex flex-col gap-4">
            <section className="card">
              <h4 className="mb-3 text-[13px] font-semibold">活动提供方</h4>
              <div className="grid grid-cols-2 gap-4">
                <Field label="LLM 提供方" env="TRADINGAGENTS_LLM_PROVIDER">
                  <select
                    className="field"
                    value={settings.llmProvider}
                    onChange={(event) => update({ llmProvider: event.target.value })}
                  >
                    {(options?.providers ?? [{ id: settings.llmProvider }]).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id}
                      </option>
                    ))}
                  </select>
                </Field>
                {showEndpoint && (
                  <Field
                    label="自定义端点"
                    env="TRADINGAGENTS_LLM_BACKEND_URL"
                    hint="仅本地运行时与通用 OpenAI 兼容端点需要填写"
                  >
                    <input
                      className="field"
                      value={settings.backendUrl ?? ''}
                      placeholder="http://localhost:11434/v1"
                      onChange={(event) => update({ backendUrl: event.target.value || null })}
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="card">
              <h4 className="mb-3 text-[13px] font-semibold">API 密钥</h4>
              <div className="flex flex-col gap-2">
                {(options?.providers ?? [])
                  .filter((item) => item.apiKeyEnv)
                  .map((item) => (
                    <KeyRow
                      key={item.id}
                      provider={item.id}
                      envName={item.apiKeyEnv as string}
                      state={keyStatus[item.apiKeyEnv as string] ?? 'missing'}
                      active={item.id === settings.llmProvider}
                      onSave={setKey}
                      onClear={clearKey}
                    />
                  ))}
              </div>
              <p className="mt-3 flex items-start gap-2 text-[11px] text-muted">
                <Shield size={13} className="mt-[2px] shrink-0" />
                <span>
                  密钥经系统钥匙串加密存储，仅在启动分析子进程时注入其环境变量；既不写入{' '}
                  <code>.env</code>，也不会回传到界面层。标记为“来自 .env”的项来自项目根目录的{' '}
                  <code>.env</code> 兜底。
                </span>
              </p>
            </section>
          </div>
        )}

        {tab === 'model' && (
          <div className="flex flex-col gap-4">
            <section className="card">
              <h4 className="mb-3 text-[13px] font-semibold">模型分工</h4>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="深度思考模型"
                  env="TRADINGAGENTS_DEEP_THINK_LLM"
                  hint="用于研究辩论、风险辩论与最终裁定"
                >
                  <ModelInput
                    value={settings.deepThinkLlm}
                    options={provider?.deepModels ?? []}
                    onChange={(value) => update({ deepThinkLlm: value })}
                  />
                </Field>
                <Field
                  label="快速思考模型"
                  env="TRADINGAGENTS_QUICK_THINK_LLM"
                  hint="用于工具调用、摘要与反思"
                >
                  <ModelInput
                    value={settings.quickThinkLlm}
                    options={provider?.quickModels ?? []}
                    onChange={(value) => update({ quickThinkLlm: value })}
                  />
                </Field>
              </div>
            </section>

            <section className="card">
              <h4 className="mb-3 text-[13px] font-semibold">推理与采样</h4>
              <ReasoningControls />
              <div className="mt-3 grid grid-cols-3 gap-4">
                <Field
                  label={`温度 · ${settings.temperature === null ? '跟随默认' : settings.temperature}`}
                  env="TRADINGAGENTS_TEMPERATURE"
                  hint="最左为不下发该参数（None），与显式设 0 不同"
                >
                  <input
                    type="range"
                    min={-1}
                    max={20}
                    step={1}
                    value={settings.temperature === null ? -1 : Math.round(settings.temperature * 10)}
                    onChange={(event) => {
                      const raw = Number(event.target.value)
                      update({ temperature: raw < 0 ? null : raw / 10 })
                    }}
                    className="w-full"
                  />
                </Field>
                <Field label="输出上限" env="TRADINGAGENTS_MAX_TOKENS" hint="留空表示跟随提供方默认">
                  <NumberInput
                    value={settings.maxTokens}
                    min={1}
                    onChange={(value) => update({ maxTokens: value })}
                  />
                </Field>
                <Field label="重试预算" env="TRADINGAGENTS_LLM_MAX_RETRIES" hint="应对突发 429 限流">
                  <NumberInput
                    value={settings.llmMaxRetries}
                    min={0}
                    max={10}
                    onChange={(value) => update({ llmMaxRetries: value })}
                  />
                </Field>
              </div>
            </section>
          </div>
        )}

        {tab === 'data' && (
          <section className="card">
            <h4 className="mb-3 text-[13px] font-semibold">数据供应商链</h4>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(settings.dataVendors).map(([category, value]) => (
                <Field key={category} label={VENDOR_LABELS[category] ?? category} env={category}>
                  <input
                    className="field"
                    value={value}
                    onChange={(event) =>
                      update({
                        dataVendors: { ...settings.dataVendors, [category]: event.target.value }
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted">
              供应商链是<strong>精确</strong>的：请求不会被静默路由到未选择的供应商。填写多个（逗号分隔）表示按顺序回退。
            </p>
          </section>
        )}

        {tab === 'run' && (
          <div className="flex flex-col gap-4">
            <section className="card">
              <h4 className="mb-3 text-[13px] font-semibold">辩论深度</h4>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`研究辩论轮次 · ${settings.maxDebateRounds}`} env="TRADINGAGENTS_MAX_DEBATE_ROUNDS">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={settings.maxDebateRounds}
                    onChange={(event) => update({ maxDebateRounds: Number(event.target.value) })}
                    className="w-full"
                  />
                </Field>
                <Field label={`风险辩论轮次 · ${settings.maxRiskRounds}`} env="TRADINGAGENTS_MAX_RISK_ROUNDS">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={settings.maxRiskRounds}
                    onChange={(event) => update({ maxRiskRounds: Number(event.target.value) })}
                    className="w-full"
                  />
                </Field>
              </div>
            </section>
            <section className="card">
              <h4 className="mb-3 text-[13px] font-semibold">输出与持久化</h4>
              <div className="grid grid-cols-2 gap-4">
                <Field label="输出语言" env="TRADINGAGENTS_OUTPUT_LANGUAGE">
                  <select
                    className="field"
                    value={settings.outputLanguage}
                    onChange={(event) => update({ outputLanguage: event.target.value })}
                  >
                    <option value="中文">中文</option>
                    <option value="English">English</option>
                  </select>
                </Field>
                <Field
                  label="对标基准"
                  env="TRADINGAGENTS_BENCHMARK_TICKER"
                  hint="留空则按交易所后缀自动选择：.HK→^HSI、.SS→000001.SS、美股→SPY"
                >
                  <input
                    className="field"
                    value={settings.benchmarkTicker ?? ''}
                    placeholder="自动"
                    onChange={(event) => update({ benchmarkTicker: event.target.value || null })}
                  />
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={settings.checkpointEnabled}
                  onChange={(event) => update({ checkpointEnabled: event.target.checked })}
                />
                <span>启用断点续跑</span>
                <span className="text-muted">每个节点后保存状态，崩溃可从最后成功步恢复</span>
              </label>
            </section>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t border-line bg-panel px-4 py-2">
        <button
          type="button"
          onClick={() => {
            void save()
            setSaved(true)
          }}
          className="rounded-lg bg-accent px-3 py-1.5 text-white"
        >
          保存配置
        </button>
        <span className="text-[12px] text-muted">
          {saved ? '已保存 · 对新建的分析生效，不影响正在运行的任务' : '保存后对新建的分析生效'}
        </span>
      </footer>
    </div>
  )
}

function ReasoningControls(): React.JSX.Element {
  const { settings, update } = useSettingsStore()
  const provider = settings.llmProvider

  if (provider === 'openai') {
    return (
      <Field label="推理强度" env="TRADINGAGENTS_OPENAI_REASONING_EFFORT">
        <EffortSelect
          value={settings.openaiReasoningEffort}
          values={['minimal', 'low', 'medium', 'high']}
          onChange={(value) => update({ openaiReasoningEffort: value })}
        />
      </Field>
    )
  }
  if (provider === 'anthropic') {
    return (
      <Field label="思考强度" env="TRADINGAGENTS_ANTHROPIC_EFFORT">
        <EffortSelect
          value={settings.anthropicEffort}
          values={['low', 'medium', 'high']}
          onChange={(value) => update({ anthropicEffort: value })}
        />
      </Field>
    )
  }
  if (provider === 'google') {
    return (
      <Field label="思考等级" env="TRADINGAGENTS_GOOGLE_THINKING_LEVEL">
        <EffortSelect
          value={settings.googleThinkingLevel}
          values={['minimal', 'low', 'medium', 'high']}
          onChange={(value) => update({ googleThinkingLevel: value })}
        />
      </Field>
    )
  }
  return <p className="text-[11px] text-muted">当前提供方没有专属推理参数。</p>
}

function EffortSelect({
  value,
  values,
  onChange
}: {
  value: string | null
  values: string[]
  onChange: (value: string | null) => void
}): React.JSX.Element {
  return (
    <select
      className="field"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">跟随默认</option>
      {values.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  )
}

function ModelInput({
  value,
  options,
  onChange
}: {
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
}): React.JSX.Element {
  // Providers with fast-moving catalogs expose only "custom", so a free-text
  // box backed by a datalist beats a select that goes stale.
  const listId = `models-${options.length}-${value}`
  return (
    <>
      <input
        className="field"
        value={value}
        list={listId}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options
          .filter((option) => option.value !== 'custom')
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </datalist>
    </>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange
}: {
  value: number | null
  min?: number
  max?: number
  onChange: (value: number | null) => void
}): React.JSX.Element {
  return (
    <input
      className="field"
      type="number"
      min={min}
      max={max}
      value={value ?? ''}
      placeholder="跟随默认"
      onChange={(event) => {
        const raw = event.target.value
        onChange(raw === '' ? null : Number(raw))
      }}
    />
  )
}

function KeyRow({
  provider,
  envName,
  state,
  active,
  onSave,
  onClear
}: {
  provider: string
  envName: string
  state: 'stored' | 'env' | 'missing'
  active: boolean
  onSave: (name: string, value: string) => Promise<void>
  onClear: (name: string) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const label =
    state === 'stored' ? '已保存' : state === 'env' ? '已配置（来自 .env）' : '未配置'
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
        active ? 'border-accent bg-accent/5' : 'border-line'
      }`}
    >
      <span className="w-28 shrink-0 text-[12px]">{provider}</span>
      <code className="w-52 shrink-0 truncate text-[11px] text-muted">{envName}</code>
      <span
        className={`w-40 shrink-0 text-[11px] ${
          state === 'missing' ? 'text-muted' : state === 'stored' ? 'text-ok' : 'text-warn'
        }`}
      >
        {label}
      </span>
      <input
        className="field"
        type="password"
        value={draft}
        placeholder="粘贴新密钥"
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        type="button"
        disabled={!draft}
        onClick={() => {
          void onSave(envName, draft)
          setDraft('')
        }}
        className="shrink-0 rounded-md border border-line px-2 py-[3px] text-[11px] disabled:opacity-40"
      >
        保存
      </button>
      <button
        type="button"
        disabled={state !== 'stored'}
        onClick={() => void onClear(envName)}
        className="shrink-0 rounded-md border border-line px-2 py-[3px] text-[11px] text-bad disabled:opacity-40"
      >
        清除
      </button>
    </div>
  )
}

function Field({
  label,
  env,
  hint,
  children
}: {
  label: string
  env?: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[12px] font-medium">
        {label}
        {env && <code className="text-[10px] font-normal text-muted">{env}</code>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  )
}
