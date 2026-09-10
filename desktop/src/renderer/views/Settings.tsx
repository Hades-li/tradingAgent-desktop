/**
 * Four groups, matching the prototype: provider + keys, models + reasoning,
 * data vendors, run defaults. Every field is annotated with the environment
 * variable it maps to so a user can cross-check against `.env` or the CLI.
 */

import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from '@renderer/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@renderer/components/ui/input-group'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { CUSTOM_ENDPOINT_PROVIDERS } from '@shared/settings'

const VENDOR_LABELS: Record<string, string> = {
  core_stock_apis: '行情接口',
  technical_indicators: '技术指标',
  fundamental_data: '基本面',
  news_data: '新闻',
  macro_data: '宏观',
  prediction_markets: '预测市场'
}

const LANGUAGES = [
  { label: '中文', value: '中文' },
  { label: 'English', value: 'English' }
]

export function SettingsView(): React.JSX.Element {
  const { settings, options, keyStatus, optionsError, update, save, setKey, clearKey } =
    useSettingsStore()
  const [saved, setSaved] = useState(false)

  const provider = options?.providers.find((item) => item.id === settings.llmProvider)
  const showEndpoint = CUSTOM_ENDPOINT_PROVIDERS.includes(settings.llmProvider)
  const providerItems = (options?.providers ?? [{ id: settings.llmProvider }]).map((item) => ({
    label: item.id,
    value: item.id
  }))

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 1800)
    return () => clearTimeout(timer)
  }, [saved])

  return (
    <Tabs defaultValue="provider" className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <span className="font-medium">模型配置</span>
        <TabsList>
          <TabsTrigger value="provider">提供方与密钥</TabsTrigger>
          <TabsTrigger value="model">模型与推理</TabsTrigger>
          <TabsTrigger value="data">数据源</TabsTrigger>
          <TabsTrigger value="run">运行默认值</TabsTrigger>
        </TabsList>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {optionsError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>无法读取模型目录</AlertTitle>
            <AlertDescription>{optionsError}</AlertDescription>
          </Alert>
        )}

        <TabsContent value="provider" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>活动提供方</CardTitle>
              <CardDescription>决定使用哪家的模型，以及是否需要自定义端点。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="provider">LLM 提供方</FieldLabel>
                  <Select
                    items={providerItems}
                    value={settings.llmProvider}
                    onValueChange={(value) => update({ llmProvider: value as string })}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {providerItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>TRADINGAGENTS_LLM_PROVIDER</FieldDescription>
                </Field>
                {showEndpoint && (
                  <Field>
                    <FieldLabel htmlFor="endpoint">自定义端点</FieldLabel>
                    <Input
                      id="endpoint"
                      value={settings.backendUrl ?? ''}
                      placeholder="http://localhost:11434/v1"
                      onChange={(event) => update({ backendUrl: event.target.value || null })}
                    />
                    <FieldDescription>TRADINGAGENTS_LLM_BACKEND_URL</FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API 密钥</CardTitle>
              <CardDescription>
                密钥经系统钥匙串加密存储，仅在启动分析子进程时注入其环境变量；既不写入 .env，也不会回传到界面层。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
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
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="model" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>模型分工</CardTitle>
              <CardDescription>深度模型负责裁定，快速模型负责工具调用与摘要。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="deep-model">深度思考模型</FieldLabel>
                  <ModelInput
                    id="deep-model"
                    value={settings.deepThinkLlm}
                    options={provider?.deepModels ?? []}
                    onChange={(value) => update({ deepThinkLlm: value })}
                  />
                  <FieldDescription>TRADINGAGENTS_DEEP_THINK_LLM</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="quick-model">快速思考模型</FieldLabel>
                  <ModelInput
                    id="quick-model"
                    value={settings.quickThinkLlm}
                    options={provider?.quickModels ?? []}
                    onChange={(value) => update({ quickThinkLlm: value })}
                  />
                  <FieldDescription>TRADINGAGENTS_QUICK_THINK_LLM</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>推理与采样</CardTitle>
              <CardDescription>留空表示不下发该参数，交由提供方使用自身默认值。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <ReasoningControls />
                <FieldGroup className="grid grid-cols-3 gap-4">
                  <Field>
                    <FieldLabel htmlFor="temperature">
                      温度 · {settings.temperature === null ? '跟随默认' : settings.temperature}
                    </FieldLabel>
                    <Slider
                      id="temperature"
                      min={-1}
                      max={20}
                      step={1}
                      value={
                        settings.temperature === null ? -1 : Math.round(settings.temperature * 10)
                      }
                      onValueChange={(value) => {
                        const raw = value as number
                        update({ temperature: raw < 0 ? null : raw / 10 })
                      }}
                    />
                    <FieldDescription>最左为 None，与显式设 0 不同</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="max-tokens">输出上限</FieldLabel>
                    <NumberInput
                      id="max-tokens"
                      value={settings.maxTokens}
                      min={1}
                      onChange={(value) => update({ maxTokens: value })}
                    />
                    <FieldDescription>TRADINGAGENTS_MAX_TOKENS</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="retries">重试预算</FieldLabel>
                    <NumberInput
                      id="retries"
                      value={settings.llmMaxRetries}
                      min={0}
                      max={10}
                      onChange={(value) => update({ llmMaxRetries: value })}
                    />
                    <FieldDescription>应对突发 429 限流</FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>数据供应商链</CardTitle>
              <CardDescription>
                供应商链是精确的：请求不会被静默路由到未选择的供应商。填写多个（逗号分隔）表示按顺序回退。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                {Object.entries(settings.dataVendors).map(([category, value]) => (
                  <Field key={category}>
                    <FieldLabel htmlFor={`vendor-${category}`}>
                      {VENDOR_LABELS[category] ?? category}
                    </FieldLabel>
                    <Input
                      id={`vendor-${category}`}
                      value={value}
                      onChange={(event) =>
                        update({
                          dataVendors: { ...settings.dataVendors, [category]: event.target.value }
                        })
                      }
                    />
                    <FieldDescription>{category}</FieldDescription>
                  </Field>
                ))}
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="run" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>辩论深度</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="debate">研究辩论轮次 · {settings.maxDebateRounds}</FieldLabel>
                  <Slider
                    id="debate"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.maxDebateRounds}
                    onValueChange={(value) => update({ maxDebateRounds: value as number })}
                  />
                  <FieldDescription>TRADINGAGENTS_MAX_DEBATE_ROUNDS</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="risk">风险辩论轮次 · {settings.maxRiskRounds}</FieldLabel>
                  <Slider
                    id="risk"
                    min={1}
                    max={5}
                    step={1}
                    value={settings.maxRiskRounds}
                    onValueChange={(value) => update({ maxRiskRounds: value as number })}
                  />
                  <FieldDescription>TRADINGAGENTS_MAX_RISK_ROUNDS</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>输出与持久化</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldGroup className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="output-language">输出语言</FieldLabel>
                    <Select
                      items={LANGUAGES}
                      value={settings.outputLanguage}
                      onValueChange={(value) => update({ outputLanguage: value as string })}
                    >
                      <SelectTrigger id="output-language">
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
                    <FieldDescription>TRADINGAGENTS_OUTPUT_LANGUAGE</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="benchmark">对标基准</FieldLabel>
                    <Input
                      id="benchmark"
                      value={settings.benchmarkTicker ?? ''}
                      placeholder="自动"
                      onChange={(event) =>
                        update({ benchmarkTicker: event.target.value || null })
                      }
                    />
                    <FieldDescription>
                      留空则按后缀自动选择：.HK→^HSI、.SS→000001.SS、美股→SPY
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                <Field orientation="horizontal">
                  <Switch
                    id="checkpoint-default"
                    checked={settings.checkpointEnabled}
                    onCheckedChange={(checked) => update({ checkpointEnabled: checked })}
                  />
                  <FieldContent>
                    <FieldTitle>启用断点续跑</FieldTitle>
                    <FieldDescription>每个节点后保存状态，崩溃可从最后成功步恢复</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>
      </div>

      <div className="flex items-center gap-3 border-t px-4 py-2">
        <Button
          onClick={() => {
            void save()
            setSaved(true)
          }}
        >
          保存配置
        </Button>
        <span className="text-muted-foreground text-sm">
          {saved ? '已保存 · 对新建的分析生效，不影响正在运行的任务' : '保存后对新建的分析生效'}
        </span>
      </div>
    </Tabs>
  )
}

function ReasoningControls(): React.JSX.Element {
  const { settings, update } = useSettingsStore()
  const provider = settings.llmProvider

  if (provider === 'openai') {
    return (
      <Field>
        <FieldLabel htmlFor="effort">推理强度</FieldLabel>
        <EffortSelect
          id="effort"
          value={settings.openaiReasoningEffort}
          values={['minimal', 'low', 'medium', 'high']}
          onChange={(value) => update({ openaiReasoningEffort: value })}
        />
        <FieldDescription>TRADINGAGENTS_OPENAI_REASONING_EFFORT</FieldDescription>
      </Field>
    )
  }
  if (provider === 'anthropic') {
    return (
      <Field>
        <FieldLabel htmlFor="effort">思考强度</FieldLabel>
        <EffortSelect
          id="effort"
          value={settings.anthropicEffort}
          values={['low', 'medium', 'high']}
          onChange={(value) => update({ anthropicEffort: value })}
        />
        <FieldDescription>TRADINGAGENTS_ANTHROPIC_EFFORT</FieldDescription>
      </Field>
    )
  }
  if (provider === 'google') {
    return (
      <Field>
        <FieldLabel htmlFor="effort">思考等级</FieldLabel>
        <EffortSelect
          id="effort"
          value={settings.googleThinkingLevel}
          values={['minimal', 'low', 'medium', 'high']}
          onChange={(value) => update({ googleThinkingLevel: value })}
        />
        <FieldDescription>TRADINGAGENTS_GOOGLE_THINKING_LEVEL</FieldDescription>
      </Field>
    )
  }
  return <FieldDescription>当前提供方没有专属推理参数。</FieldDescription>
}

function EffortSelect({
  id,
  value,
  values,
  onChange
}: {
  id: string
  value: string | null
  values: string[]
  onChange: (value: string | null) => void
}): React.JSX.Element {
  const items = [{ label: '跟随默认', value: '' }, ...values.map((item) => ({ label: item, value: item }))]
  return (
    <Select
      items={items}
      value={value ?? ''}
      onValueChange={(next) => onChange((next as string) || null)}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function ModelInput({
  id,
  value,
  options,
  onChange
}: {
  id: string
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
}): React.JSX.Element {
  // Providers with fast-moving catalogs expose only "custom", so a free-text
  // box backed by a datalist beats a select that goes stale.
  const listId = `${id}-options`
  return (
    <>
      <Input id={id} value={value} list={listId} onChange={(event) => onChange(event.target.value)} />
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
  id,
  value,
  min,
  max,
  onChange
}: {
  id: string
  value: number | null
  min?: number
  max?: number
  onChange: (value: number | null) => void
}): React.JSX.Element {
  return (
    <Input
      id={id}
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

const KEY_STATE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  stored: { label: '已保存', variant: 'default' },
  env: { label: '已配置（来自 .env）', variant: 'secondary' },
  missing: { label: '未配置', variant: 'outline' }
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
  const badge = KEY_STATE[state]

  return (
    <Field orientation="responsive" data-active={active || undefined}>
      <FieldContent>
        <FieldTitle>
          {provider}
          {active && <Badge variant="outline">当前</Badge>}
        </FieldTitle>
        <FieldDescription>
          {envName} · {badge.label}
        </FieldDescription>
      </FieldContent>
      <InputGroup className="max-w-xs">
        <InputGroupInput
          type="password"
          value={draft}
          placeholder="粘贴新密钥"
          aria-label={`${provider} API key`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            disabled={!draft}
            onClick={() => {
              void onSave(envName, draft)
              setDraft('')
            }}
          >
            保存
          </InputGroupButton>
          <InputGroupButton
            variant="ghost"
            disabled={state !== 'stored'}
            onClick={() => void onClear(envName)}
          >
            清除
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}
