/**
 * Four groups, matching the prototype: provider + keys, models + reasoning,
 * data vendors, run defaults. Every field is annotated with the environment
 * variable it maps to so a user can cross-check against `.env` or the CLI.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
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
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { modelChoices, modelsForProvider } from '@renderer/lib/model-choice'
import { endpointSource, useSettingsStore } from '@renderer/store/settingsStore'
import { LOCALES, type UiLanguage } from '@shared/i18n/locales'
import { CUSTOM_ENDPOINT_PROVIDERS } from '@shared/settings'

const LANGUAGES = [
  { label: '中文', value: '中文' },
  { label: 'English', value: 'English' }
]

export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')
  const { settings, options, keyStatus, optionsError, update, save, setKey, clearKey } =
    useSettingsStore()
  const [saved, setSaved] = useState(false)

  const showEndpoint = CUSTOM_ENDPOINT_PROVIDERS.includes(settings.llmProvider)
  const interfaceLanguages = [
    { label: tCommon('language.system'), value: 'system' },
    ...LOCALES.map((locale) => ({ label: locale.nativeName, value: locale.code }))
  ]
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
        <span className="font-medium">{t('title')}</span>
        <TabsList>
          <TabsTrigger value="provider">{t('tabs.provider')}</TabsTrigger>
          <TabsTrigger value="model">{t('tabs.model')}</TabsTrigger>
          <TabsTrigger value="data">{t('tabs.data')}</TabsTrigger>
          <TabsTrigger value="run">{t('tabs.run')}</TabsTrigger>
        </TabsList>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {optionsError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>{t('catalogError')}</AlertTitle>
            <AlertDescription>{optionsError}</AlertDescription>
          </Alert>
        )}

        <TabsContent value="provider" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('provider.title')}</CardTitle>
              <CardDescription>{t('provider.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="provider">{t('provider.label')}</FieldLabel>
                  <Select
                    items={providerItems}
                    value={settings.llmProvider}
                    onValueChange={(value) => {
                      const next = value as string
                      const nextProvider = options?.providers.find((item) => item.id === next)
                      update({ llmProvider: next, ...modelsForProvider(nextProvider, settings) })
                    }}
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
                    <FieldLabel htmlFor="endpoint">{t('provider.endpoint')}</FieldLabel>
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
              <CardTitle>{t('keys.title')}</CardTitle>
              <CardDescription>{t('keys.description')}</CardDescription>
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
          <ModelRoles />

          <Card>
            <CardHeader>
              <CardTitle>{t('reasoning.title')}</CardTitle>
              <CardDescription>{t('reasoning.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <ReasoningControls />
                <FieldGroup className="grid grid-cols-3 gap-4">
                  <Field>
                    <FieldLabel htmlFor="temperature">
                      {t('reasoning.temperature', {
                        value: settings.temperature === null ? t('followDefault') : settings.temperature
                      })}
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
                    <FieldDescription>{t('reasoning.temperatureHint')}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="max-tokens">{t('reasoning.maxTokens')}</FieldLabel>
                    <NumberInput
                      id="max-tokens"
                      value={settings.maxTokens}
                      min={1}
                      onChange={(value) => update({ maxTokens: value })}
                    />
                    <FieldDescription>TRADINGAGENTS_MAX_TOKENS</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="retries">{t('reasoning.retries')}</FieldLabel>
                    <NumberInput
                      id="retries"
                      value={settings.llmMaxRetries}
                      min={0}
                      max={10}
                      onChange={(value) => update({ llmMaxRetries: value })}
                    />
                    <FieldDescription>{t('reasoning.retriesHint')}</FieldDescription>
                  </Field>
                </FieldGroup>
              </FieldGroup>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>{t('vendors.title')}</CardTitle>
              <CardDescription>{t('vendors.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                {Object.entries(settings.dataVendors).map(([category, value]) => (
                  <Field key={category}>
                    <FieldLabel htmlFor={`vendor-${category}`}>
                      {t(`vendors.category.${category}`, { defaultValue: category })}
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
              <CardTitle>{t('interface.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Field className="max-w-xs">
                <FieldLabel htmlFor="ui-language">{t('interface.language')}</FieldLabel>
                <Select
                  items={interfaceLanguages}
                  value={settings.uiLanguage}
                  onValueChange={(value) => update({ uiLanguage: value as UiLanguage })}
                >
                  <SelectTrigger id="ui-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {interfaceLanguages.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t('interface.languageHint')}</FieldDescription>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('debate.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="debate">
                    {t('debate.research', { rounds: settings.maxDebateRounds })}
                  </FieldLabel>
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
                  <FieldLabel htmlFor="risk">
                    {t('debate.risk', { rounds: settings.maxRiskRounds })}
                  </FieldLabel>
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
              <CardTitle>{t('output.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldGroup className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="output-language">{t('output.language')}</FieldLabel>
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
                    <FieldLabel htmlFor="benchmark">{t('output.benchmark')}</FieldLabel>
                    <Input
                      id="benchmark"
                      value={settings.benchmarkTicker ?? ''}
                      placeholder={t('output.benchmarkAuto')}
                      onChange={(event) =>
                        update({ benchmarkTicker: event.target.value || null })
                      }
                    />
                    <FieldDescription>{t('output.benchmarkHint')}</FieldDescription>
                  </Field>
                </FieldGroup>
                <Field orientation="horizontal">
                  <Switch
                    id="checkpoint-default"
                    checked={settings.checkpointEnabled}
                    onCheckedChange={(checked) => update({ checkpointEnabled: checked })}
                  />
                  <FieldContent>
                    <FieldTitle>{t('output.checkpoint')}</FieldTitle>
                    <FieldDescription>{t('output.checkpointHint')}</FieldDescription>
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
          {t('save')}
        </Button>
        <span className="text-muted-foreground text-sm">
          {saved ? t('savedHint') : t('unsavedHint')}
        </span>
      </div>
    </Tabs>
  )
}

function ReasoningControls(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const { settings, update } = useSettingsStore()
  const provider = settings.llmProvider

  if (provider === 'openai') {
    return (
      <Field>
        <FieldLabel htmlFor="effort">{t('reasoning.effort.openai')}</FieldLabel>
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
        <FieldLabel htmlFor="effort">{t('reasoning.effort.anthropic')}</FieldLabel>
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
        <FieldLabel htmlFor="effort">{t('reasoning.effort.google')}</FieldLabel>
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
  return <FieldDescription>{t('reasoning.none')}</FieldDescription>
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
  const { t } = useTranslation('settings')
  const items = [{ label: t('followDefault'), value: '' }, ...values.map((item) => ({ label: item, value: item }))]
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

function ModelRoles(): React.JSX.Element {
  const { t } = useTranslation('settings')
  const {
    settings,
    options,
    update,
    endpointModels,
    endpointModelsLoading,
    endpointModelsError,
    fetchEndpointModels
  } = useSettingsStore()
  const provider = options?.providers.find((item) => item.id === settings.llmProvider)
  const canDiscover = CUSTOM_ENDPOINT_PROVIDERS.includes(settings.llmProvider)
  const source = endpointSource(settings)
  const discovered = endpointModels?.source === source ? endpointModels.models : []

  // Ask the endpoint once per provider/URL as soon as this tab is shown.
  useEffect(() => {
    if (!canDiscover || endpointModels?.source === source) return
    void fetchEndpointModels()
  }, [canDiscover, source])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('models.title')}</CardTitle>
        <CardDescription>{t('models.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {canDiscover && (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={endpointModelsLoading}
                onClick={() => void fetchEndpointModels()}
              >
                <RefreshCw className={endpointModelsLoading ? 'animate-spin' : undefined} />
                {t('models.discover')}
              </Button>
              <span
                className={
                  endpointModelsError ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'
                }
              >
                {endpointModelsLoading
                  ? t('models.discovering')
                  : endpointModelsError ??
                    (endpointModels?.source === source
                      ? t('models.discovered', { count: discovered.length })
                      : t('models.discoverHint'))}
              </span>
            </div>
          )}
          <FieldGroup className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="deep-model">{t('models.deep')}</FieldLabel>
              <ModelSelect
                key={settings.llmProvider}
                id="deep-model"
                value={settings.deepThinkLlm}
                catalog={provider?.deepModels ?? []}
                discovered={discovered}
                onChange={(value) => update({ deepThinkLlm: value })}
              />
              <FieldDescription>TRADINGAGENTS_DEEP_THINK_LLM</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="quick-model">{t('models.quick')}</FieldLabel>
              <ModelSelect
                key={settings.llmProvider}
                id="quick-model"
                value={settings.quickThinkLlm}
                catalog={provider?.quickModels ?? []}
                discovered={discovered}
                onChange={(value) => update({ quickThinkLlm: value })}
              />
              <FieldDescription>TRADINGAGENTS_QUICK_THINK_LLM</FieldDescription>
            </Field>
          </FieldGroup>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

const CUSTOM_CHOICE = '__custom__'

function ModelSelect({
  id,
  value,
  catalog,
  discovered,
  onChange
}: {
  id: string
  value: string
  catalog: { label: string; value: string }[]
  discovered: string[]
  onChange: (value: string) => void
}): React.JSX.Element {
  const { t } = useTranslation('settings')
  // The option list must not depend on the value being typed: Base UI resets a
  // controlled value that disappears from its list, which would close the input.
  const choices = modelChoices(catalog, discovered)
  const listed = choices.some((choice) => choice.value === value)
  const [customMode, setCustomMode] = useState(!listed)
  const custom = customMode || !listed
  const items = [
    ...choices.map((choice) => ({ label: choice.value, value: choice.value })),
    { label: t('models.custom'), value: CUSTOM_CHOICE }
  ]
  const groups = [
    { key: 'catalog', label: t('models.group.catalog') },
    { key: 'endpoint', label: t('models.group.endpoint') }
  ] as const

  return (
    <div className="flex flex-col gap-2">
      <Select
        items={items}
        value={custom ? CUSTOM_CHOICE : value}
        onValueChange={(next, details) => {
          // Only a user's pick counts; Base UI's own resets arrive as null / reason "none".
          if (typeof next !== 'string' || details.reason === 'none') return
          if (next === CUSTOM_CHOICE) {
            setCustomMode(true)
            return
          }
          setCustomMode(false)
          onChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-80">
          {groups.map((group) => {
            const members = choices.filter((choice) => choice.source === group.key)
            if (members.length === 0) return null
            return (
              <SelectGroup key={group.key}>
                <SelectLabel>{group.label}</SelectLabel>
                {members.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    <span className="font-mono">{choice.value}</span>
                    {choice.hint && (
                      <span className="text-muted-foreground truncate">{choice.hint}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          })}
          {choices.length > 0 && <SelectSeparator />}
          <SelectGroup>
            <SelectItem value={CUSTOM_CHOICE}>{t('models.custom')}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          id={`${id}-custom`}
          value={value}
          placeholder={t('models.customPlaceholder')}
          className="font-mono"
          onChange={(event) => onChange(event.target.value.trim())}
        />
      )}
    </div>
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
  const { t } = useTranslation('settings')
  return (
    <Input
      id={id}
      type="number"
      min={min}
      max={max}
      value={value ?? ''}
      placeholder={t('followDefault')}
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
  const { t } = useTranslation('settings')

  return (
    <Field orientation="responsive" data-active={active || undefined}>
      <FieldContent>
        <FieldTitle>
          {provider}
          {active && <Badge variant="outline">{t('keys.current')}</Badge>}
        </FieldTitle>
        <FieldDescription>
          {envName} · {t(`keys.state.${state}`)}
        </FieldDescription>
      </FieldContent>
      <InputGroup className="max-w-xs">
        <InputGroupInput
          type="password"
          value={draft}
          placeholder={t('keys.placeholder')}
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
            {t('keys.save')}
          </InputGroupButton>
          <InputGroupButton
            variant="ghost"
            disabled={state !== 'stored'}
            onClick={() => void onClear(envName)}
          >
            {t('keys.clear')}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}
