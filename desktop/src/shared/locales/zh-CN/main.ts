export const main = {
  engineNotFound: '未找到分析引擎：{{binary}}。请先运行 scripts/build-sidecar.sh。',
  engineNoOptions: '分析引擎没有返回选项数据',
  engineNoMarketData: '分析引擎没有返回行情数据',
  keychainUnavailable: '系统钥匙串不可用，无法安全保存密钥',
  engineStartFailed: '无法启动分析引擎：{{message}}'
} as const
