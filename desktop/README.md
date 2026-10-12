# TradingAgents Desktop

Electron + React 客户端。与 Python 核心的唯一耦合点是 **stdio JSON-Lines 协议**
（契约见 `../tradingagents/PROTOCOL.md`，TS 镜像在 `src/shared/protocol.ts`）。

## 开发

```bash
# 一次性：准备 Python 环境（桌面端开发态直接调用它）
cd .. && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"

cd desktop
npm install
npm run dev          # electron-vite 开发服务器 + Electron 窗口
```

开发态用仓库根目录的 `.venv/bin/python -m tradingagents.ipc_main` 作为分析引擎，
可用 `TRADINGAGENTS_PYTHON` 指向任意解释器。

```bash
npm run typecheck    # tsc --noEmit（main/preload/shared 与 renderer 两套）
npm run test         # vitest，测试就近放在 src/**/*.test.ts
npm run build        # typecheck + electron-vite build
```

## 打包

```bash
../scripts/build-sidecar.sh   # PyInstaller --onedir -> desktop/build/sidecar
npm run pack:mac              # 只出 .app，自用足够
npm run dist:mac              # 出 DMG
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

## UI 组件（shadcn）

组件以**源码**形式落在 `src/renderer/components/ui/`，由 CLI 生成，不是运行时依赖。
底座是 **Base UI**（`@base-ui/react`），预设 `base-nova`，配置见 `components.json`。

```bash
npx shadcn@latest add <component>     # 新增组件
npx shadcn@latest add <c> --dry-run   # 先看会动哪些文件
npx shadcn@latest add <c> --diff <f>  # 升级时对比上游与本地改动
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
  3. 运行 `npx vitest run`：`i18n.test.ts` 会检查各语言的 key、占位符是否一致，并扫描渲染进程里残留的写死中文。
- 复数用 `_one` / `_other` 等后缀，各语言按自己的规则提供。

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
