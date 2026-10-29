export const main = {
  engineNotFound: '未找到分析引擎：{{binary}}。请先运行 scripts/build-sidecar.sh。',
  engineNoOptions: '分析引擎没有返回选项数据',
  engineNoMarketData: '分析引擎没有返回行情数据',
  keychainUnavailable: '系统钥匙串不可用，无法安全保存密钥',
  engineStartFailed: '无法启动分析引擎：{{message}}',
  updateHttpError: '更新服务器返回 HTTP {{status}}',
  updateBadManifest: '更新信息格式不正确',
  updateChecksumMismatch: '安装包校验失败，可能下载不完整，请重试',
  updateBadPackage: '安装包中没有找到应用',
  updateNotInstallable: '当前运行方式不支持安装更新',
  updateNotReplaceable:
    '应用所在位置无法写入，不能自动替换。已在访达中显示新版本，请手动将其拖入「应用程序」文件夹。',
  updateInterruptMessage: '分析仍在进行，现在安装会中止它',
  updateInterruptDetail: '应用将关闭并安装 v{{version}}，完成后自动重新打开。',
  updateInterruptConfirm: '中止分析并安装',
  updateInterruptCancel: '稍后'
} as const
