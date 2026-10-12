export const settings = {
  title: 'Model configuration',
  tabs: {
    provider: 'Provider & keys',
    model: 'Models & reasoning',
    data: 'Data sources',
    run: 'Run defaults'
  },
  catalogError: 'Could not read the model catalog',
  followDefault: 'Provider default',
  provider: {
    title: 'Active provider',
    description: 'Chooses whose models are used and whether a custom endpoint is needed.',
    label: 'LLM provider',
    endpoint: 'Custom endpoint'
  },
  keys: {
    title: 'API keys',
    description:
      'Keys are encrypted by the system keychain and only injected into the environment of the analysis process at launch. They are never written to .env or sent back to the UI.',
    current: 'Active',
    placeholder: 'Paste a new key',
    save: 'Save',
    clear: 'Clear',
    state: {
      stored: 'Saved',
      env: 'Configured (from .env)',
      missing: 'Not configured'
    }
  },
  models: {
    title: 'Model roles',
    description: 'The deep model makes the rulings; the quick model handles tool calls and summaries.',
    deep: 'Deep-thinking model',
    quick: 'Quick-thinking model'
  },
  reasoning: {
    title: 'Reasoning & sampling',
    description: 'Leave a field empty to omit it and let the provider use its own default.',
    temperature: 'Temperature · {{value}}',
    temperatureHint: 'Far left is None, which differs from explicitly setting 0',
    maxTokens: 'Output limit',
    retries: 'Retry budget',
    retriesHint: 'Absorbs sudden 429 rate limits',
    effort: {
      openai: 'Reasoning effort',
      anthropic: 'Thinking effort',
      google: 'Thinking level'
    },
    none: 'The current provider has no dedicated reasoning parameter.'
  },
  vendors: {
    title: 'Data vendor chains',
    description:
      'Chains are exact: requests are never silently routed to a vendor you did not pick. List several (comma-separated) to fall back in order.',
    category: {
      core_stock_apis: 'Market data',
      technical_indicators: 'Technical indicators',
      fundamental_data: 'Fundamentals',
      news_data: 'News',
      macro_data: 'Macro',
      prediction_markets: 'Prediction markets'
    }
  },
  debate: {
    title: 'Debate depth',
    research: 'Research debate rounds · {{rounds}}',
    risk: 'Risk debate rounds · {{rounds}}'
  },
  interface: {
    title: 'Interface',
    language: 'Interface language',
    languageHint: 'Only changes the app itself; the language of AI reports is set by "Output language".'
  },
  output: {
    title: 'Output & persistence',
    language: 'Output language',
    benchmark: 'Benchmark',
    benchmarkAuto: 'Auto',
    benchmarkHint: 'Leave empty to pick by suffix: .HK→^HSI, .SS→000001.SS, US stocks→SPY',
    checkpoint: 'Enable checkpoint resume',
    checkpointHint: 'Saves state after every node so a crash can resume from the last good step'
  },
  save: 'Save settings',
  savedHint: 'Saved · applies to new analyses, running tasks are unaffected',
  unsavedHint: 'Applies to new analyses once saved'
}
