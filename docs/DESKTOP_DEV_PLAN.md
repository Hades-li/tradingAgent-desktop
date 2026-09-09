# TradingAgents Desktop —— 开发交接文档

本文件是 Electron 桌面客户端改造的完整方案与已核实的代码事实。
新会话可直接依此开工，无需重新调研。

- 本项目路径：`/Users/ignis/DevSpaces/money/TradingAgents-desktop`
- 来源：从 `TradingAgents-0.4.0` 拷贝（已排除 `.venv` / `__pycache__` / `*.egg-info`）
- UI 原型：`docs/ui-prototype.html`（浏览器直接打开，可交互）

---

## 0. 环境重建（第一件事）

旧 `.venv` 故意没拷贝 —— 它内含指向旧路径的 editable 安装，拷过来会导致
`import tradingagents` 加载旧目录代码，问题极隐蔽。

```bash
cd /Users/ignis/DevSpaces/money/TradingAgents-desktop
python3 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"     # 含 pytest / pytest-subtests / ruff
.venv/bin/python -m pytest -q                   # 建立回归基线，务必先跑
```

本机环境：macOS 26.6.2 / arm64、Node v22.23.0、npm 10.9.8、Python 3.12。

---

## 1. 核心结论

项目**原本不提供任何对外 API** —— 无 HTTP/REST/WebSocket 服务，无 Web 框架依赖。
仅有两个入口：Typer CLI（`tradingagents = "cli.main:app"`）和 Python 库
（`TradingAgentsGraph.propagate()`）。所有 "API" 字样都是**出向**的（LLM 厂商、数据源）。

改造思路不是重写核心，而是**抽出一层**。项目已具备两个关键条件：

1. **已有流式驱动** —— `cli/main.py:1144` 用 `graph.graph.stream(...)` 逐步产出状态
2. **已有视图模型** —— `MessageBuffer`（`cli/main.py:76`）持有界面所需全部状态

---

## 2. 架构决策

### 2.1 进程模型：每次分析一个独立 Python 进程 + stdio JSON-Lines

```
Electron Main (Node)
  ├─ 进程池 / 生命周期 / 密钥托管 / IPC 中继
  ├─→ Renderer (React)         : ipcMain ↔ ipcRenderer
  └─→ Python sidecar (每 run 一个进程) : spawn + stdout 逐行 JSON
```

**为什么 stdio 而非本地 HTTP 服务**

- 安全：本地 FastAPI 会开端口，该进程持有可花钱的 API key，任何本地进程甚至
  浏览器页面（DNS rebinding）都可能打到它
- 免端口管理：无需探测空闲端口、处理冲突与重启残留
- 依赖更轻：不需要 fastapi + uvicorn，PyInstaller 少打一堆

**为什么"每 run 一进程"** —— 一个决策同时解决三个问题：

| 问题 | 进程隔离后 |
|---|---|
| `TradingAgentsGraph` 有实例状态（`self.ticker`、`self._resuming`） | 天然隔离，无需重构 |
| LangGraph `.stream()` 是同步阻塞生成器 | 独立进程里阻塞无害 |
| 内存日志 `trading_memory.md` 并发写冲突 | 可按 run 传 `TRADINGAGENTS_MEMORY_LOG_PATH` 隔离 |

代价：每进程重新 import langchain/pandas，冷启动约 2–4 秒。对分钟级任务可忽略。

### 2.2 配置与密钥存储：不写 `.env`

| 内容 | 位置 |
|---|---|
| 非密钥配置（模型、轮次、数据源、语言…） | `app.getPath('userData')/settings.json` |
| API 密钥 | 系统钥匙串（Electron `safeStorage` 加密） |

启动子进程时统一转成 `TRADINGAGENTS_*` 与 `*_API_KEY` 注入 `env`，进程退出即消失。
**密钥只存在于主进程与 Python 进程内存，永不传给渲染层。**

**免费的优先级红利**：`tradingagents/__init__.py:14` 的 `load_dotenv(...)` 用
python-dotenv 默认的 `override=False`（源码注释明确写了 "never clobbers values the
caller has already exported"）。所以**注入的 env 天然优先于 `.env`** —— 无需改动
核心代码就得到正确优先级：GUI 配置赢，`.env` 仅作兜底。

**必须处理的副作用**：GUI 留空/"跟随默认"的项，`.env` 里的同名变量仍会生效，用户会
困惑。建议在设置界面显示来源（"已配置（来自 .env）"）。另建议加一个默认关闭的开关
"同时写入项目 .env"，照顾同时用 CLI 的用户。

---

## 3. 已核实的代码事实（带行号，勿再重复调研）

### 3.1 需要迁出的翻译逻辑（全在 `cli/main.py`）

| 位置 | 内容 |
|---|---|
| `cli/main.py:1144` 起 | stream chunk → 状态的翻译主循环（约 200+ 行） |
| `cli/main.py:852` | `update_analyst_statuses` |
| `cli/main.py:829` | `update_research_team_status` |
| `cli/main.py:941` | `classify_message_type` |
| `cli/main.py:76` | `MessageBuffer` 的三张映射表 |
| `cli/main.py:152` | `get_completed_reports_count`（报告计数逻辑） |
| `cli/main.py:187` | `update_report_section` —— **覆盖式**语义，非追加 |
| `cli/main.py:316` | `all_teams` 五个团队分组（UI 布局依据） |

**`MessageBuffer` 三张表**（`cli/main.py:77-104`）：

- `FIXED_AGENTS`：Research Team / Trading Team / Risk Management / Portfolio Management
- `ANALYST_MAPPING`：`market|social|news|fundamentals` → 显示名
- `REPORT_SECTIONS`：section → `(analyst_key, finalizing_agent)`，共 7 段：
  `market_report` / `sentiment_report` / `news_report` / `fundamentals_report` /
  `investment_plan` / `trader_investment_plan` / `final_trade_decision`

### 3.2 ⚠️ 去重逻辑绝不能丢

`stream_mode="values"`（定义在 `tradingagents/graph/propagation.py:82`）的语义是
**每个 chunk 都携带累积的完整 `messages` 列表**。现有代码靠
`message_buffer._processed_message_ids` 按 message id 去重。抽离时漏掉它，
界面会刷出成倍重复消息。

### 3.3 核心 API

`tradingagents/graph/trading_graph.py:404`

```python
propagate(company_name, trade_date, asset_type="stock") -> (final_state, signal)
```

- `signal` 是五档评级（Buy / Overweight / Hold / Underweight / Sell）
  或 **`"REVIEW"`**（无法解析评级时）
- 判断必须用 `tradingagents.agents.utils.rating.is_review`，之后才能映射到
  `PortfolioRating`。**前端不要假设永远是五档**
- 断点续跑三件套已封装好：`begin_checkpoint` / `checkpoint_input` /
  `end_checkpoint`（配 `finally`）；`clear_all_checkpoints` 在
  `tradingagents/graph/checkpointer.py`

### 3.4 抽离的先例（重要）

`cli/main.py:763`：

```python
def save_report_to_disk(final_state, ticker: str, save_path: Path):
    """Save the complete analysis report to disk (shared CLI/API writer)."""
    return write_report_tree(final_state, ticker, save_path)
```

薄壳，实现在 `tradingagents/reporting.py`（101 行）。docstring 写的是
**"shared CLI/API writer"** —— 维护者已预留非 CLI 消费者。
`session.py` 的抽离与项目自身方向一致。

### 3.5 打包相关的三处路径坑

| 位置 | 问题 | 处理 |
|---|---|---|
| `cli/main.py:1285` | `Path.cwd() / "reports"` —— **CWD 相对**，打包后 CWD 不确定 | spawn 时显式 `cwd: app.getPath('userData')`，**无需改代码** |
| `tradingagents/__init__.py:14` | `find_dotenv(usecwd=True)` 从 CWD 向上找，打包后找不到 | 不依赖 `.env`，key 由 spawn 的 `env` 注入 |
| `cli/main.py:498` | `Path(__file__).parent / "static" / "welcome.txt"` | PyInstaller 需 `--add-data`（pyproject 的 package-data 只对 wheel 生效） |

**好消息**：`tradingagents/default_config.py` 里 `results_dir` / `data_cache_dir` /
`memory_log_path` 全部锚定 `_TRADINGAGENTS_HOME = ~/.tradingagents`，是 HOME 相对而非
CWD 相对，打包后天然正常。

### 3.6 ⚠️ stdout 污染源（已定位）

以下位置直接 `print()` 到 **stdout**，会破坏 JSON-Lines 协议：

- `tradingagents/dataflows/y_finance.py:191`、`:266`
- `tradingagents/dataflows/alpha_vantage_common.py:150`
- `tradingagents/dataflows/alpha_vantage_indicator.py:214`
- `tradingagents/dataflows/utils.py:48`

**不改这些文件**。在 `ipc_main.py` 开头一次重定向即可，并兜住未来新增的 print：

```python
_protocol = sys.stdout      # 私有句柄，只给协议用
sys.stdout = sys.stderr     # 任何 print() 改道 stderr
```

**日志侧是干净的**：全项目只用 `logging.getLogger(__name__)`，无 `basicConfig`、
无 `StreamHandler`。故 `logger.info` 未配置时不输出，WARNING 以上走 lastResort 到
stderr，不与协议抢 stdout。

### 3.7 环境变量校验会在 import 期崩溃

`default_config.py` 的 `_coerce` 对非法值**主动抛 ValueError**（作者刻意 fail loudly）。
GUI 若传 `TRADINGAGENTS_MAX_DEBATE_ROUNDS="abc"`，Python 在 import 阶段就炸，
报错对用户无意义。**渲染层务必先做表单校验再 spawn**，数字框限制为 number 类型。

`_ENV_OVERRIDES` 可覆盖的键（`default_config.py`）：
`llm_provider` / `deep_think_llm` / `quick_think_llm` / `backend_url` /
`output_language` / `max_debate_rounds` / `max_risk_discuss_rounds` /
`checkpoint_enabled` / `benchmark_ticker` / `temperature` / `llm_max_retries` /
`max_tokens` / `google_thinking_level` / `openai_reasoning_effort` / `anthropic_effort`

### 3.8 CLI 会写 `.env`（现状说明）

`cli/utils.py:603` `ensure_api_key()`：仅当环境变量缺失时交互索要密钥，
然后用 `set_key`（`cli/utils.py:645-647`）**单行增量**写入 `.env`。
写入仅限 API 密钥；`TRADINGAGENTS_*` 配置项从无任何写入路径。
GUI 不沿用此做法（理由见 2.2）。

### 3.9 表单项对应的 CLI 交互函数（`cli/utils.py`）

`get_ticker:37` / `get_analysis_date:102` / `select_analysts:135` /
`select_research_depth:167` / `select_openrouter_model:246` /
`select_shallow_thinking_agent:329` / `select_deep_thinking_agent:334` /
`select_llm_provider:405` / `ask_output_language`

建议加 `--dump-options` 子命令让 Python 输出可选 provider/模型清单，
避免选项在前后端各维护一份。

---

## 4. 事件协议

`tradingagents/PROTOCOL.md` 为唯一事实来源，`desktop/src/shared/protocol.ts` 手工对齐。
每个事件带 `"v": 1`，前端遇到未知版本明确报错而非静默错渲染。

```ts
type RunEvent =
  | { v:1; type:"run_started";    runId:string; ticker:string; date:string }
  | { v:1; type:"agent_status";   agent:string; status:"pending"|"in_progress"|"completed" }
  | { v:1; type:"report_section"; section:SectionKey; content:string }  // Markdown，全量替换
  | { v:1; type:"tool_call";      name:string; args:unknown }
  | { v:1; type:"message";        role:string; content:string }
  | { v:1; type:"run_finished";   signal:string; isReview:boolean }
  | { v:1; type:"error";          message:string; recoverable:boolean };
```

- `SectionKey` 对齐 `REPORT_SECTIONS` 的 7 个键
- `isReview` **必须单独给布尔字段** —— Python 侧用 `is_review` 判完给结论，
  别让前端猜字符串
- `report_section` 语义为**全量替换**，与 `update_report_section` 一致

### Node 侧消费要点

- **stdout 容错**：每行 `JSON.parse` 包 try/catch，失败降级为日志
- **超长行**：单段报告可达几十 KB，用 `readline`，勿自行按固定 buffer 切
- **取消运行**：先 `SIGTERM` 给 `finally` 里的 `end_checkpoint()` 留窗口，
  超时 5 秒再 `SIGKILL`
- **退出兜底**：`app.on('before-quit')` 遍历杀子进程，否则关窗后仍在烧 token
- Python 侧需 `sys.stdout.flush()` + 启动带 `PYTHONUNBUFFERED=1`（双保险）

---

## 5. 前端技术栈（版本已锁定）

**重要**：逐包取最新稳定版是**不可满足**的 —— `electron-vite@5.0.0`（最新稳定）
peer 为 `vite ^5||^6||^7`，封顶 Vite 7；而 vite 最新是 8.2.2，
`@vitejs/plugin-react@6.x` 又只认 vite ^8。支持 Vite 8 的 `electron-vite@6` 仍是 beta。

**已决定**：走 electron-vite 5 默认约定，全部使用正式发布版。

```json
{
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "zustand": "5.0.15",
    "react-markdown": "10.1.0",
    "remark-gfm": "4.0.1",
    "react-resizable-panels": "4.12.4",
    "lightweight-charts": "5.2.1",
    "lucide-react": "1.43.0"
  },
  "devDependencies": {
    "electron": "44.3.0",
    "electron-builder": "26.15.3",
    "electron-vite": "5.0.0",
    "vite": "7.3.6",
    "@vitejs/plugin-react": "5.2.0",
    "typescript": "7.0.2",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.7",
    "tailwindcss": "4.3.3",
    "@tailwindcss/vite": "4.3.3",
    "vitest": "5.0.0"
  }
}
```

- `@types/node` 另取最新 22.x 或 24.x
- `electron-vite@5` 把 `@swc/core` 列为 peer，仅用 SWC 时才需装
- 应用而非库：**写精确版本（不带 `^`）**，配 `.npmrc` 的 `save-exact=true`，
  提交 `package-lock.json`
- **TypeScript 7.0.2** 是原生编译器版本（跳过 6.x）。先在空目录跑通
  `tsc --noEmit` 与 lint 再定；确认 `typescript-eslint` 支持。**回退选项 6.0.3 / 5.9.3**
- **Tailwind 4 无 `tailwind.config.js`**：CSS 优先，入口写 `@import "tailwindcss";`，
  令牌用 `@theme { }`，通过 `@tailwindcss/vite` 接入（不走 PostCSS）

---

## 6. 目录结构

```
TradingAgents-desktop/
├── tradingagents/                    # 核心，基本不动
│   ├── session.py                    # ✚ 事件生成器（chunk → RunEvent）
│   ├── ipc_main.py                   # ✚ stdio JSON-Lines 入口
│   ├── PROTOCOL.md                   # ✚ 协议单一事实来源
│   ├── graph/ agents/ dataflows/ llm_clients/    # 不动
│   ├── default_config.py  reporting.py           # 不动
├── cli/
│   ├── main.py                       # ✎ 唯一实质改动（约 250 行迁出）
│   └── utils.py  config.py  static/  # 不动
├── tests/                            # 不动（pytest testpaths 锁定此处）
├── docs/
│   ├── DESKTOP_DEV_PLAN.md           # 本文件
│   └── ui-prototype.html             # UI 原型（可交互）
├── desktop/                          # ✚ 全部新增，与 Python 零耦合
│   ├── package.json  electron.vite.config.ts  electron-builder.yml
│   ├── tsconfig.json  .npmrc
│   ├── src/
│   │   ├── main/                     # index / run-manager / python-bridge
│   │   │   │                         # env-builder / settings-store / keychain
│   │   │   └                         # reports-reader / ipc-handlers
│   │   ├── preload/index.ts          # contextBridge 白名单
│   │   ├── renderer/
│   │   │   ├── views/                # NewAnalysis / Dashboard / Settings / History
│   │   │   ├── components/           # Pipeline / EventStream / ReportTabs / ResizablePanels
│   │   │   ├── store/                # Zustand
│   │   │   └── styles/index.css      # Tailwind 4 CSS 优先入口
│   │   └── shared/protocol.ts        # RunEvent 联合类型
│   ├── resources/                    # 图标 / entitlements.plist
│   └── build/                        # PyInstaller 产物落点（git 忽略）
├── scripts/
│   ├── smoke_structured_output.py    # 现有
│   └── build-sidecar.sh              # ✚ PyInstaller 打包
└── pyproject.toml  .gitignore  .dockerignore  Dockerfile  ...
```

`pyproject.toml` 的 `[tool.setuptools.packages.find] include = ["tradingagents*", "cli*"]`
只收这两个包，`desktop/` 不会被打进 wheel，天然隔离。
目录名用 `desktop/` 而非 `electron/`，将来换 Tauri 壳不用改名。

---

## 7. 必须同步改的配置

**`.dockerignore`（最要紧）** —— 当前无 node_modules 条目，而 Dockerfile 是 `COPY . .`，
不加会把 `desktop/node_modules` 整个塞进构建上下文：

```
desktop/node_modules
desktop/build
desktop/dist
desktop/release
```

**`.gitignore`** —— 现有 `build/` `dist/` 恰好覆盖 desktop 子目录，但无 node_modules：

```
node_modules/
desktop/release/
*.tsbuildinfo
```

**`pyproject.toml`** —— 移除三个声明却零引用的依赖（已逐一核实）：
`backtrader`、`redis`、`parsel`

⚠️ **注意**：去掉 `parsel` **不能**连带干掉 lxml（20MB）——
`yfinance -> lxml>=4.9.0` 是硬依赖（非 extra），lxml 必须保留。

---

## 8. CI 约束（`.github/workflows/ci.yml`）

| Job | 影响 |
|---|---|
| `lint`（ruff strict 全仓库） | **`desktop/` 下不要放任何 `.py`**。`extend-exclude` 只排除 `results`/`worklog` |
| `test`（py3.10–3.13 矩阵） | `session.py` 必须兼容 **Python 3.10**，不用 3.11+ 新语法 |
| `smoke-install` | 跑 `python -c "import tradingagents, cli.main"`。`ipc_main.py` 入口逻辑必须包在 `if __name__ == "__main__":` 内 |

前端测试用 vitest 就近放 `desktop/src/**/*.test.ts`，**不要放进 `tests/`**
（pytest testpaths 锁定在那里，混放会让 pytest 尝试收集 TS）。
前端 CI 单独加 job，勿塞进 Python 矩阵。

ruff 配置：line-length 100、target py310、select `E,W,F,I,B,UP,C4,SIM`、
`**/__init__.py` 忽略 F401。

---

## 9. UI 设计（原型见 `docs/ui-prototype.html`）

三栏布局 + 可拖拽分隔条：

```
[侧栏 212] │ [流水线 212] ⇔ [事件流 310] ⇔ [分析结果 flex]
```

- **左栏流水线**：五个团队分组（源自 `cli/main.py:316`），三态徽章驱动
  （pending / in_progress / completed）
- **中栏事件流**：全高，带 `全部 / 工具 / 消息 / 系统` 过滤器。真实运行时工具调用
  会淹没 agent 推理消息，分流必要
- **右栏分析结果**：7 个 Tab 对齐 `REPORT_SECTIONS`；手动切 Tab 后出现"跟随最新"按钮
- **分隔条**：用 `react-resizable-panels`（自带约束 + 键盘支持 + 宽度持久化）。
  约束：分析结果列保留最小 300px
- 报告内容本就是 Markdown，`react-markdown` + `remark-gfm` 直接渲染，零转换
- 窄窗口收起顺序：侧栏 → 中栏事件流

**设置界面**（侧栏底部齿轮进入）四组：

1. **提供方与密钥** —— 提供方切换联动密钥表高亮与端点字段；仅 `ollama` /
   `openai_compatible` 显示"自定义端点"（符合 `backend_url` 实际语义）
2. **模型与推理** —— 推理参数随提供方变化：openai→reasoning effort、
   anthropic→effort、google→thinking level，其余明确提示"无专属参数"
3. **数据源** —— 六个类别对应 `data_vendors`，保留逗号分隔的顺序回退写法
4. **运行默认值** —— 辩论轮次、输出语言、对标基准、断点续跑

每个字段挂对应环境变量名，便于与 `.env` / CLI 对照。
⚠️ 温度滑块最左是"跟随默认"（`temperature=None`）而非 0 —— `None` 表示不下发该参数，
与显式设 0 是两种不同行为。

**可顺手拿到的两个功能**

- **断点续跑** —— checkpointer 三件套已封装，崩溃后"恢复"几乎不用写新逻辑
- **历史浏览** —— `reports/` 已结构化落盘：
  `NVDA_20260908_185608/{complete_report.md, 1_analysts/, 2_research/, 3_trading/,
  4_risk/, 5_portfolio/}`，直接读目录树，起步无需数据库

---

## 10. 打包与分发

### 用户无需安装 Python 或 Node

PyInstaller 内嵌 CPython + 全部依赖，Electron 自带 Chromium/Node。
用户只需自备 LLM API 密钥与网络。

### 体积（实测）

旧 venv site-packages **263MB**，大头：pandas 48M / numpy 24M / lxml 20M /
openai 18M / cryptography 13M / langchain_community 11M。
预估安装后 **400–450MB**，安装包压缩后 180–250MB。

**免费优化**：`rich` 只被 `cli/announcements.py`、`cli/utils.py`、`cli/main.py` 引用，
`tradingagents/` 完全不用。sidecar 入口指向 `tradingagents.ipc_main` 时，
PyInstaller 静态分析走不到 `cli/`，故 `rich` / `pygments`(5.2M) / `typer` /
`questionary` **会自动排除**，无需显式 `--exclude-module`。

### PyInstaller 要点

- 用 `--onedir`（**不要** `--onefile`）—— onefile 每次启动都解压，pandas/langchain
  这种体量意味着数秒额外延迟
- `--collect-all` 处理 langchain 系列 —— 大量动态 import 与 entry_points，
  静态分析抓不全，**缺模块是最常见的失败原因**
- electron-builder 用 `extraResources` 放 sidecar，运行时用 `process.resourcesPath` 定位

### macOS（已决定：先不签名）

- Apple Silicon 上"不签名"≠零签名。arm64 内核拒绝执行无签名二进制，实际是
  **ad-hoc 签名**（`codesign -s -`），PyInstaller 与 electron-builder 都会自动做
- **构建顺序有讲究**：PyInstaller 打 sidecar → 放入 resources → electron-builder
  **最后**统一签名。反过来会让签名失效，arm64 直接启动失败
- **本地构建自用零障碍**（无 quarantine 属性）
- **分发时的坑**：quarantine 递归打在整个 `.app` 上，主进程 spawn 内嵌 sidecar 时
  该二进制也带 quarantine，可能被拒执行。表现为**"应用能开，点开始分析毫无反应"**，
  Electron 侧只看到子进程立即退出。解法：
  ```bash
  xattr -dr com.apple.quarantine /Applications/TradingAgents.app
  ```
  建议在 `run-manager.ts` 做检测：sidecar 启动后立刻非零码退出就弹窗提示此命令
- **不签名的意外好处**：绕开 Hardened Runtime，不需要
  `com.apple.security.cs.disable-library-validation` entitlement
- 架构不能交叉编译，arm64 与 x64 需分别构建
- 自用可跳过 DMG，`--dir` 输出 `.app` 拖进 Applications 即可
- 正式分发再买 Developer ID（$99/年），改动只在 `electron-builder.yml` 与 CI

### Windows

- 不需额外装 VC++ 运行时（`vcruntime140.dll` 会被一起收进去）
- **杀软误报是真实痛点** —— PyInstaller 产物是误报重灾区。代码签名效果最明显，
  `--onedir` 比 `--onefile` 触发率低
- 无签名会触发 SmartScreen"未知发布者"。OV 证书自 2023-06 起强制硬件令牌/云 HSM

---

## 11. 实施顺序

1. **环境重建 + 跑 `pytest` 建基线**（见第 0 节）
2. **抽 `tradingagents/session.py`**，让现有 CLI 改用它跑通
   —— 唯一有回归风险的步骤，改完再跑 `pytest` 对比，确保 CLI 行为零变化
3. **`tradingagents/ipc_main.py`** + 手工验证：
   `python -m tradingagents.ipc_main '{...}' | head` 看 JSON 行是否实时流出
4. **Electron 骨架**：electron-vite 5 脚手架 + spawn + readline + IPC 中继，
   先用最丑的 `<pre>` 把事件打屏
5. **React 正式界面**：表单 → 三栏看板 → Markdown 报告 → 设置
6. **打包链路**：PyInstaller + electron-builder（预留充足时间给缺模块与 ad-hoc 签名）
7. 历史列表、图表、断点续跑

**建议**：第 6 步的打包链路可以提前用现有代码空跑一次，尽早暴露 langchain 在
PyInstaller 下缺模块的问题 —— 这是最高频的失败点。

---

## 12. 唯一需要纪律的地方

`tradingagents/PROTOCOL.md` 与 `desktop/src/shared/protocol.ts` 描述同一份契约却分处
两种语言，是这个结构里唯一容易漂移的点。以 `PROTOCOL.md` 为准，TS 手工对齐，
靠事件里的 `v` 字段兜底。规模再大才值得上 codegen。
