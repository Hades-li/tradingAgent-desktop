export const dashboard = {
  state: {
    idle: '待启动',
    running: '运行中',
    finished: '已完成',
    failed: '已失败',
    cancelled: '已取消'
  },
  pipeline: {
    stock: '股票管线',
    crypto: '加密货币管线'
  },
  stat: {
    elapsed: '已用时',
    toolCalls: '工具调用',
    reports: '报告',
    current: '当前'
  },
  stop: '停止',
  column: {
    pipeline: '智能体流水线',
    stream: '事件流',
    results: '分析结果'
  },
  log: {
    system: '系统',
    error: '错误',
    started: '已启动 {{ticker}} · {{date}}',
    finished: '分析完成 · $t(domain:rating.{{rating}})',
    finishedNoRating: '分析完成 · 无评级'
  },
  stream: {
    all: '全部',
    tool: '工具',
    msg: '消息',
    sys: '系统',
    count_one: '{{count}} 条',
    count_other: '{{count}} 条'
  },
  reports: {
    followLatest: '跟随最新',
    emptyTitle: '尚未生成内容',
    emptyDescription: '该板块会在对应的智能体完成后填充。'
  }
} as const
