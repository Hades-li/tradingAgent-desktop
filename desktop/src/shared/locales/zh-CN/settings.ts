export const settings = {
  title: '模型配置',
  tabs: {
    provider: '提供方与密钥',
    model: '模型与推理',
    data: '数据源',
    run: '运行默认值'
  },
  catalogError: '无法读取模型目录',
  followDefault: '跟随默认',
  provider: {
    title: '活动提供方',
    description: '决定使用哪家的模型，以及是否需要自定义端点。',
    label: 'LLM 提供方',
    endpoint: '自定义端点'
  },
  keys: {
    title: 'API 密钥',
    description:
      '密钥经系统钥匙串加密存储，仅在启动分析子进程时注入其环境变量；既不写入 .env，也不会回传到界面层。',
    current: '当前',
    placeholder: '粘贴新密钥',
    save: '保存',
    clear: '清除',
    state: {
      stored: '已保存',
      env: '已配置（来自 .env）',
      missing: '未配置'
    }
  },
  models: {
    title: '模型分工',
    description: '深度模型负责裁定，快速模型负责工具调用与摘要。',
    deep: '深度思考模型',
    quick: '快速思考模型'
  },
  reasoning: {
    title: '推理与采样',
    description: '留空表示不下发该参数，交由提供方使用自身默认值。',
    temperature: '温度 · {{value}}',
    temperatureHint: '最左为 None，与显式设 0 不同',
    maxTokens: '输出上限',
    retries: '重试预算',
    retriesHint: '应对突发 429 限流',
    effort: {
      openai: '推理强度',
      anthropic: '思考强度',
      google: '思考等级'
    },
    none: '当前提供方没有专属推理参数。'
  },
  vendors: {
    title: '数据供应商链',
    description:
      '供应商链是精确的：请求不会被静默路由到未选择的供应商。填写多个（逗号分隔）表示按顺序回退。',
    category: {
      core_stock_apis: '行情接口',
      technical_indicators: '技术指标',
      fundamental_data: '基本面',
      news_data: '新闻',
      macro_data: '宏观',
      prediction_markets: '预测市场'
    }
  },
  debate: {
    title: '辩论深度',
    research: '研究辩论轮次 · {{rounds}}',
    risk: '风险辩论轮次 · {{rounds}}'
  },
  interface: {
    title: '界面',
    language: '界面语言',
    languageHint: '只影响应用界面；AI 报告使用的语言由“输出语言”决定。'
  },
  output: {
    title: '输出与持久化',
    language: '输出语言',
    benchmark: '对标基准',
    benchmarkAuto: '自动',
    benchmarkHint: '留空则按后缀自动选择：.HK→^HSI、.SS→000001.SS、美股→SPY',
    checkpoint: '启用断点续跑',
    checkpointHint: '每个节点后保存状态，崩溃可从最后成功步恢复'
  },
  save: '保存配置',
  savedHint: '已保存 · 对新建的分析生效，不影响正在运行的任务',
  unsavedHint: '保存后对新建的分析生效'
} as const
