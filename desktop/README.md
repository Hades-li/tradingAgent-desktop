# TradingAgents Desktop

Electron + React 客户端。与 Python 核心的唯一耦合点是 **stdio JSON-Lines 协议**
（契约见 `../tradingagents/PROTOCOL.md`，TS 镜像在 `src/shared/protocol.ts`）。

## 开发

```bash
# 一次性：准备 Python 环境（桌面端开发态直接调用它）
cd .. && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"

cd desktop
pnpm install
pnpm run dev          # electron-vite 开发服务器 + Electron 窗口
```

开发态用仓库根目录的 `.venv/bin/python -m tradingagents.ipc_main` 作为分析引擎，
可用 `TRADINGAGENTS_PYTHON` 指向任意解释器。

```bash
pnpm run typecheck    # tsc --noEmit（main/preload/shared 与 renderer 两套）
pnpm run test         # vitest，测试就近放在 src/**/*.test.ts
pnpm run build        # typecheck + electron-vite build
```

## 打包

```bash
../scripts/build-sidecar.sh   # PyInstaller --onedir -> desktop/build/sidecar
pnpm run pack:mac              # 只出 .app，自用足够
pnpm run dist:mac              # 出 DMG
```

实测体积（arm64）：sidecar 140MB、`TradingAgents.app` 472MB。`rich` / `pygments` /
`typer` / `questionary` 因入口指向 `tradingagents.ipc_main` 而被自动排除，无需显式
`--exclude-module`。

**打包态不读仓库的 `.env`**：密钥必须在设置界面里存进系统钥匙串，否则运行会以
`error` 事件报 401。开发态则仍可用 `.env` 兜底，并在界面上标注「已配置（来自 .env）」。

**顺序不能反**：sidecar 必须先放进 `desktop/build/sidecar`，再由 electron-builder
统一签名；先签名再塞二进制会让签名失效，Apple Silicon 会直接拒绝启动。

当前不购买 Developer ID，走 ad-hoc 签名（`codesign -s -`，PyInstaller 与
electron-builder 都会自动做）。本机构建自用无障碍；若把 DMG 拷到别的机器，
quarantine 属性会递归打到内嵌 sidecar 上，表现为「应用能开、点开始分析毫无反应」。
解法：

```bash
xattr -dr com.apple.quarantine /Applications/TradingAgents.app
```

应用已内建这条提示：子进程启动后立即非零退出时会在界面上显示该命令。

## 应用图标

源文件是 `resources/icon.svg`，打包用的 `resources/icon.png`（1024px，macOS / Linux）
和 `resources/icon.ico`（16–256px 多尺寸，Windows 程序、任务栏与 NSIS 安装器）都由它生成。
改完 SVG 后重新生成并一起提交：

```bash
pnpm run icons
```

ICO 比 PNG 裁得更紧（Windows 图标习惯贴边，不留 macOS 那圈安全边距），
256px 以下的尺寸用 BMP 编码以兼容旧版 Windows 外壳。

## UI 组件（shadcn）

组件以**源码**形式落在 `src/renderer/components/ui/`，由 CLI 生成，不是运行时依赖。
底座是 **Base UI**（`@base-ui/react`），预设 `base-nova`，配置见 `components.json`。

```bash
pnpm dlx shadcn@latest add <component>     # 新增组件
pnpm dlx shadcn@latest add <c> --dry-run   # 先看会动哪些文件
pnpm dlx shadcn@latest add <c> --diff <f>  # 升级时对比上游与本地改动
```

三点约定：

- **语义色**。用 `bg-primary` / `text-muted-foreground`，不要写死颜色；深浅色由
  `main.tsx` 依据系统设置切换根元素上的 `dark` 类，没有主题开关。
- **表单用 `Field` 系列**，不要用裸 `div` + `space-y-*`。选项在 2–7 个之间用
  `ToggleGroup`（事件流的过滤器就是）。
- **Base UI 不是 Radix**：组合用 `render={<Component />}` 而非 `asChild`，
  `Select` 需要 `items` 属性，`Slider` 单值传数字而非数组。

`tsconfig.json` 里重复了一份路径别名：CLI 只读根 tsconfig，看不到 references
里的配置。`files: []` 保证它本身不参与编译。

字体没有采用预设自带的 Geist —— 它没有 CJK 字形，界面是中文，混排会露馅，
所以 `--font-sans` 保持系统字体栈。

## 多语言

界面文案用 `i18next` + `react-i18next`，渲染进程和主进程共用同一套资源。

- 文案在 `src/shared/locales/<语言代码>/<命名空间>.ts`，首批语言是 `zh-CN`（基准）和 `en`。
- 引擎协议里的评级、智能体名、报告段名始终是英文标识，显示文字放在 `domain` 命名空间，用 `useDomain()` 取；缺项时显示原文。
- 设置里的 `uiLanguage` 是界面语言（`system` 跟随系统），与 `outputLanguage`（AI 报告的语言）互相独立。
- 新增一种语言：
  1. 复制 `src/shared/locales/en` 为新目录并翻译，在 `index.ts` 导出，如 `fr`。
  2. 在 `src/shared/i18n/index.ts` 的 `RESOURCES` 里登记，并在 `src/shared/i18n/locales.ts` 的 `LOCALES` 里加一行 `{ code, nativeName }`。
  3. 运行 `pnpm test`：`i18n.test.ts` 会检查各语言的 key、占位符是否一致，并扫描渲染进程里残留的写死中文。
- 复数用 `_one` / `_other` 等后缀，各语言按自己的规则提供。

## 在线更新

主进程定时检查（启动 10 秒后一次，之后每 4 小时一次），发现新版本时在侧边栏底部、
设置按钮左侧显示「更新」按钮。整个流程不会自动下载：

1. 用户点「更新」后才开始下载，按钮上显示下载进度；下载完成后用 `latest*.yml` 里的 sha512 校验文件。
2. 校验通过时，如果没有正在进行的分析，应用会立即关闭并开始安装。
3. 如果有分析正在进行，就先不安装，按钮变成「安装」，等用户再点一次。用户点击时分析如果还没结束，会弹窗确认是否中止分析。

| 平台 | 下载的文件 | 安装方式 |
| --- | --- | --- |
| Windows | `TradingAgents-Setup-<版本>.exe` | 静默运行 NSIS（`--updated /S --force-run`），装完自动重启 |
| macOS | `TradingAgents-<版本>-arm64-mac.zip` | 由 `ditto` 解压，脱离主进程的脚本在应用退出后替换 `.app`（替换失败会回滚），然后重新打开应用 |

macOS 不走 Squirrel.Mac，因为它要求 Developer ID 签名。由于安装包是应用自己下载的，
不会带 quarantine 标记，所以只有首次安装时需要执行一次 `xattr`。

如果应用被系统隔离运行（App Translocation），或所在目录不可写，就无法自动替换。
这时会在访达里显示新版本，并提示用户手动把它拖进「应用程序」文件夹。

**更新源**：在 `electron-builder.yml` 的 `publish` 段配置，打包时会写进应用里的
`resources/app-update.yml`。目前用的是 GitHub Releases，换成自建静态源时改为
`provider: generic` 加 `url` 即可。客户端会请求 `<源>/latest*.yml` 和 `<源>/<文件名>`。

**发版**：

1. 修改 `package.json` 的 `version`。
2. 推送对应的 `v<version>` tag。Package workflow 会打包并创建一个 **draft** release。
3. 确认无误后手动发布这个 release。在此之前，用户的客户端检测不到新版本。

**本地调试**：

```bash
python3 -m http.server 8765 -d /path/to/dir-with-latest-yml   # 放 latest-mac.yml 和安装包
TRADINGAGENTS_UPDATE_URL=http://127.0.0.1:8765 pnpm run dev
```

开发态可以走通检查和下载两步，到安装这一步会报「当前运行方式不支持安装更新」。
要验证完整流程，需要用打包好的应用搭配上面的环境变量。

## 结构

```
src/
├── main/          Electron 主进程
│   ├── index.ts             窗口与生命周期
│   ├── run-manager.ts       每次分析一个子进程：spawn / readline / 取消
│   ├── python-bridge.ts     开发态与打包态的 sidecar 定位
│   ├── env-builder.ts       设置 -> TRADINGAGENTS_* 与密钥环境变量（纯函数）
│   ├── settings-store.ts    userData/settings.json
│   ├── keychain.ts          safeStorage 加密的密钥库（只写不读回渲染层）
│   ├── reports-reader.ts    历史报告目录树
│   ├── updater/             在线更新：清单解析、下载校验、各平台安装
│   └── ipc-handlers.ts      渲染层的全部权限面
├── preload/index.ts         contextBridge 白名单
├── renderer/                React 界面（三栏看板 / 表单 / 设置 / 历史）
└── shared/                  协议、设置结构、中文标签
```

## 两条纪律

1. **协议以 `tradingagents/PROTOCOL.md` 为准**，`src/shared/protocol.ts` 手工对齐，
   靠事件里的 `v` 字段兜底：遇到未知版本明确报错，不做乐观渲染。
2. **密钥不进渲染层**。渲染层只能写入和查询「是否已配置」，读取仅发生在主进程
   拼装子进程环境变量的那一刻。
