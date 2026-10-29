export const market = {
  title: '标的选择',
  tabs: {
    us: '美股',
    crypto: '数字货币',
    hk: '港股',
    cn: 'A 股'
  },
  searchPlaceholder: '搜索代码或名称',
  searchHint: '数据来自 Yahoo Finance，搜索请输入代码或英文名（暂不支持中文名）。',
  clearSearch: '清除搜索',
  listCaption: '按市值排序的前 {{total}} 个标的',
  searchCaption: '“{{query}}” 的搜索结果',
  marketCap: '市值 {{value}}',
  loadFailed: '行情加载失败',
  retry: '重试',
  emptyList: '暂无数据',
  emptySearch: '没有找到匹配的标的',
  emptySearchHint: '换个代码或英文名试试，或切换到其他分类。',
  noSelection: '请选择一个标的',
  selected: '已选：{{symbol}}',
  analyze: '分析所选标的'
} as const
