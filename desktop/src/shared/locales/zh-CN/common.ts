export const common = {
  language: {
    system: '跟随系统'
  },
  app: {
    engineExited:
      '分析引擎异常退出（code {{code}}）。若为已下载的安装包，请执行：xattr -dr com.apple.quarantine /Applications/TradingAgents.app'
  }
} as const
