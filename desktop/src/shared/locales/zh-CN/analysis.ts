export const analysis = {
  title: '新建分析',
  ticker: '标的代码',
  tickerHint: {
    empty: '输入代码后自动识别资产类型',
    stock: '已识别为股票管线',
    crypto: '已识别为加密货币管线'
  },
  date: '分析日期',
  dateHint: '历史日期会启用前视数据过滤',
  analysts: '分析师团队',
  analystsHint: '至少选择一项；未选中的分析师不会进入流水线。',
  depth: '研究深度 · {{rounds}} 轮辩论',
  depthHint: '对应 max_debate_rounds / max_risk_discuss_rounds',
  outputLanguage: '输出语言',
  outputLanguageHint: '内部辩论固定英文以保证推理质量',
  checkpoint: '启用断点续跑',
  checkpointHint: '崩溃后可从最后一个成功节点恢复',
  start: '开始分析',
  summary: '使用提供方 {{provider}} · {{count}} 个 agent'
} as const
