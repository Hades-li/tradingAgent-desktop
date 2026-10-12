export const analysis = {
  title: 'New analysis',
  ticker: 'Ticker',
  tickerHint: {
    empty: 'The asset type is detected once you enter a ticker',
    stock: 'Detected as the stock pipeline',
    crypto: 'Detected as the crypto pipeline'
  },
  date: 'Analysis date',
  dateHint: 'A past date turns on look-ahead data filtering',
  analysts: 'Analyst team',
  analystsHint: 'Select at least one. Analysts left unchecked stay out of the pipeline.',
  depth: 'Research depth · {{rounds}} debate rounds',
  depthHint: 'Maps to max_debate_rounds / max_risk_discuss_rounds',
  outputLanguage: 'Output language',
  outputLanguageHint: 'Internal debate stays in English to keep reasoning quality',
  checkpoint: 'Enable checkpoint resume',
  checkpointHint: 'Resume from the last successful node after a crash',
  start: 'Start analysis',
  summary: 'Provider {{provider}} · {{count}} agents'
}
