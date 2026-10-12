# DocLens

DocLens 是一个面向仓库 `docs/` 目录的独立 Web 项目，聚焦三件事：

- 文档浏览：目录树、面包屑、文件预览、行号与标题定位
- 全文搜索：基于 `ripgrep (rg)` 的文本类文件检索、高亮与命中跳转
- 审阅提效：PR 文件面板、历史审阅单查看、状态流转与 SQLite 存储

项目以 [`docs/prd/doclens_prd.md`](./docs/prd/doclens_prd.md) 为唯一需求事实来源（SSOT），并遵守“只读 docs、路径安全、行为保持式重构”的工程约束。

## 适用边界

DocLens 当前面向本地或内网单机使用，默认只连接一个文档根目录。服务端可以读取 docs 源文件，但不会提供任何写入 docs 源文件的 API；已读、星标、历史审阅单等结构化状态写入本项目 SQLite。

第一期保留历史审阅单查看与状态流转，不提供在线创建审阅单或编辑 docs 源文件能力。后续如扩展多仓聚合、账号体系、PR/Issue 联动，应先更新 PRD，再调整实现与 README。

## 技术栈

- Next.js 14（App Router）
- React 18
- TypeScript
- MUI 5
- SQLite + Drizzle ORM
- ripgrep (`rg`)
- Vitest
- Word 导出：`@turbodocx/html-to-docx`、`sharp`

## 当前能力

### 文档浏览

- 左侧目录树懒加载，支持筛选
- 中间预览区支持 Markdown、代码/文本、PDF
- 支持通过 `path`、`#L120`、`#heading-xxx` 做稳定定位
- 支持文档详情导出为 `.doc` / `.docx`
- 支持文档星标，星标状态与 PR 面板共享
- 支持在详情页通过 DeepSeek 对话阅读当前文本文件：首次打开生成中文概述，重开恢复历史，可围绕文档多轮提问
- 聊天窗口全屏展示，支持流式回答、停止、重试、Markdown 排版和移动端布局；历史按 docs 根目录与文档路径保存在 SQLite，重开可恢复
- 顶部“新建聊天”位于目录按钮左侧，无需选择文档即可创建独立空白聊天；每次创建使用新会话 ID，发送问题后才开始生成，已有聊天记录保留。
- 消息区独立滚动，跟随最新回复时会在内容、Mermaid 渲染、输入区或窗口高度变化后自动定位末尾；上翻阅读时保留位置，“回到底部”仅显示向下箭头图标，点击后立即定位并恢复跟随，最后一行不被输入区遮挡。
- 回答适合描述流程、关系或状态时，优先生成一张简洁 Mermaid 图；对比、分类、映射或参数内容优先使用紧凑 Markdown 表格，简单事实短句回答。避免图表、表格和重复长文并用。
- Mermaid 采用严格安全模式并清洗 SVG；Mermaid 块仍在流式生成时显示“正在生成图表...”占位，不频繁重绘，消息完成、停止或出错后再渲染一次。解析或安全校验失败时保留原始源码并显示提示。Markdown 表格沿用现有渲染能力，不改变聊天 API。
- 聊天图表使用 `presentation="chat"`：不显示外部轮廓和 Mermaid 标题栏，仅显示 SVG；内嵌区域最高占当前页面高度的 1/3，同时按内容宽度等比例缩放，完整显示图表。左上角提供 44px × 44px 放大按钮，不显示 tooltip 悬浮提示，并留出按钮空间，避免遮挡图表节点。放大预览按 SVG 自然尺寸显示并允许横纵平移，不缩小适配视口；普通文档预览继续使用默认 `presentation="document"` 外观。

### 搜索

- 默认使用 `rg` 对 docs 根目录内文本类文件做全文检索
- 支持命中片段、高亮、分页与条件过滤
- 搜索结果可直接跳转到文件与命中位置

### 审阅

- 提供 PR 文件面板与已读状态同步
- 提供历史审阅单列表与详情页
- 支持审阅单和问题项的状态流转
- 已读与星标统一存储在 `doc_states`，`pr_review_files` 只承担 PR 文件快照职责

## 项目结构

```text
app/                     Next.js 路由与 API
src/features/docs/       文档浏览相关 domain / services / ui
src/features/search/     搜索相关 domain / services / ui
src/features/reviews/    审阅相关 domain / services / ui
src/shared/              共享逻辑、组件、工具
db/                      Drizzle schema、数据库客户端、迁移脚本
data/                    本地 SQLite 数据目录，已在 .gitignore 忽略
docs/prd/                PRD 与项目文档
```

## 快速开始

### 1. 检查前置依赖

- Node.js 与 pnpm 使用项目本机环境即可。
- `rg` 必须在 `PATH` 中，否则 `/search` 和搜索 API 无法工作。
- SQLite 数据库文件会按 `DOCLENS_DB_PATH` 自动落到本地 `data/`，该目录不会提交到 Git。

```bash
rg --version
pnpm --version
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

在项目根目录创建 `.env`。如果只浏览本仓 `docs/`，可不配置；如果要浏览产品仓文档，建议显式设置 `DOCLENS_DOCS_ROOT`：

```env
# 允许访问的文档根目录（只读），可配置为产品仓库根目录或产品仓库 docs 目录
DOCLENS_DOCS_ROOT=../adsynapse-smart-ads/docs

# SQLite 数据库路径（审阅、文档状态与聊天历史）
DOCLENS_DB_PATH=./data/doclens.sqlite

# 搜索实现：当前默认 rg
DOCLENS_SEARCH_PROVIDER=rg

# 搜索/目录忽略目录（逗号分隔）
DOCLENS_SEARCH_IGNORE=third_parties,node_modules,.git,.next,.turbo,dist,build,coverage

# 单文件预览大小上限（字节）
DOCLENS_MAX_FILE_PREVIEW_BYTES=2097152

# 单文件预览最大行数
DOCLENS_MAX_FILE_PREVIEW_LINES=500

# 文档 AI 对话（API 密钥仅配置在服务端，不要使用 NEXT_PUBLIC_ 前缀）
DOCLENS_DEEPSEEK_API_KEY=your-server-side-api-key
DOCLENS_DEEPSEEK_BASE_URL=https://api.deepseek.com
DOCLENS_DEEPSEEK_MODEL=deepseek-flash
DOCLENS_DEEPSEEK_TIMEOUT_MS=120000
```

### 4. 初始化数据库

```bash
pnpm db:migrate
```

`db:migrate` 会创建审阅单、PR 文件快照、历史星标兼容表、统一文档状态表与文档聊天历史表。已有旧数据时，会从 `starred_docs` 与 `pr_review_files` 回填到 `doc_states`；聊天表以增量迁移加入，不重置既有数据。

### 5. 启动开发环境

```bash
pnpm dev
```

默认访问：

- `http://localhost:3000/docs`
- `http://localhost:3000/search`
- `http://localhost:3000/reviews`

## 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DOCLENS_DOCS_ROOT` | 否 | `./docs` | 文档根目录，只允许只读访问；可指向产品仓库根目录或 `path/to/product_root/docs` |
| `DOCLENS_DB_PATH` | 否 | `./data/doclens.sqlite` | SQLite 数据库文件路径 |
| `DOCLENS_SEARCH_PROVIDER` | 否 | `rg` | 搜索实现，当前项目默认 `rg` |
| `DOCLENS_SEARCH_IGNORE` | 否 | `third_parties,node_modules,.git,.next,.turbo,dist,build,coverage` | 搜索与目录树忽略的目录 |
| `DOCLENS_MAX_FILE_PREVIEW_BYTES` | 否 | `2097152` | 单文件预览字节上限，超出后走截断策略 |
| `DOCLENS_MAX_FILE_PREVIEW_LINES` | 否 | `500` | 单文件预览最大行数 |
| `DOCLENS_DEEPSEEK_API_KEY` | 文档聊天必填 | 无 | DeepSeek 服务端 API 密钥；不进入浏览器 |
| `DOCLENS_DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | DeepSeek API 基础地址 |
| `DOCLENS_DEEPSEEK_MODEL` | 否 | `deepseek-flash` | 文档对话使用的模型；与 [DeepSeek 官方首次调用文档](https://api-docs.deepseek.com/zh-cn/) 当前示例一致 |
| `DOCLENS_DEEPSEEK_TIMEOUT_MS` | 否 | `120000` | 上游请求超时毫秒数 |

说明：

- 这些变量默认只在服务端读取，不应使用 `NEXT_PUBLIC_` 暴露到浏览器。
- `DOCLENS_DEEPSEEK_API_KEY` 仅由 `/api/chat` 服务端读取。只有当前文档历史为空时首次打开生成概述，或用户显式发送问题、点击重试时才向配置的 DeepSeek 服务发送文本；恢复已有历史只通过 GET。请勿把密钥写进客户端变量、代码或日志。
- 文档聊天的输入上限：每个新问题最多 4,000 字符、每条持久消息最多 32,000 字符、JSON body 不超过 512 KiB。每轮模型请求只带入最近最多 40 条消息且总计不超过 100,000 字符；超出部分仍完整保存在 SQLite，不设 20 轮等永久对话上限。
- 历史接口每页最多 40 条且总计最多 100,000 字符，默认载入最新页，可按 `beforeMessageId` 加载更早历史。存在未带入本轮模型上下文的历史时，界面提示：“历史完整保存，本轮参考当前文档与最近对话”。
- 每轮请求都由服务端读取并参考当前文档的完整原文，通过固定 system prompt 作为上下文；历史页预算和模型聊天消息上下文预算不能裁剪原文。单份文档必须同时不超过 524,288 字节和 100,000 字符；超出时显示清楚的错误，不得静默截断后声称已阅读全文。
- 未配置 `DOCLENS_DEEPSEEK_API_KEY` 时，聊天界面会显示可读的配置错误。当前无文本提取器的 PDF 和二进制文件不支持聊天。
- 聊天历史保存在 `DOCLENS_DB_PATH` 对应的 SQLite 中，不修改 docs，也不写入 localStorage/sessionStorage。聊天属于项目级全局状态，按 canonical docs root 与规范化文档路径隔离；关闭窗口不删除记录。
- 每次打开先从 `/api/chat/history` 恢复历史；只有文档从未产生过聊天记录时才生成首条概述。文档发生变化时保留原历史并提示，新的提问使用服务端读取的当前文档版本。
- 顶部新建的独立聊天以 docs 根目录与会话 ID 隔离，只参考当前会话的最近对话，不附带文档。创建和读取空聊天无需模型密钥，也不会请求模型；关闭后历史仍保存在 SQLite。
- 同一文档的多窗口生成由 SQLite generation lease 串行化。停止、掉线、超时或进程中断会保存已生成片段和状态；重新打开只恢复，不自动重发。再次生成需用户显式点击重试。
- 即使环境变量被错误配置，服务端仍会对路径做归一化与根目录校验。
- `DOCLENS_SEARCH_PROVIDER` 目前只实现 `rg`；保留该变量是为了后续索引化搜索迁移。

### 文档根目录模式

DocLens 会根据 `DOCLENS_DOCS_ROOT` 自动进入两种模式：

| 模式 | 触发方式 | 路径语义 | 目录与搜索范围 |
| --- | --- | --- | --- |
| `docs-directory` | 配置值直接指向 `.../docs`，或目标目录下没有嵌套 `docs/` | API 内部路径是 docs 内相对路径；复制路径、导出元信息补齐为 `docs/...` | 跟踪 docs 目录内可预览文件，排除 `DOCLENS_SEARCH_IGNORE` |
| `project-root` | 配置值指向产品仓根目录，且根目录下存在 `docs/` | API 内部路径是仓库相对路径，例如 `docs/prd/demo.md` | 跟踪仓库内 Markdown 文件，包含 `.codex`、`.agents` 等隐藏文档目录；搜索强制收敛为 Markdown |

两种模式都禁止绝对路径、`..` 路径穿越和命中忽略目录的访问。`path` 参数可带 `#L120` 或 heading hash，服务端会先剥离锚点再做路径校验。

## 常用命令

```bash
pnpm dev          # 本地开发
pnpm build        # 生产构建
pnpm start        # 启动生产环境
pnpm test:run     # 运行测试
pnpm test         # 监听模式测试
pnpm db:generate  # 生成 Drizzle 迁移
pnpm db:migrate   # 执行数据库迁移
```

## 主要路由与接口

### 页面路由

- `/docs`：文档主工作区
- `/docs/view?path=...`：单文件直达
- `/search`：搜索页
- `/reviews`：审阅单列表
- `/reviews/:id`：审阅单详情

### API 路由

| 方法 | 路径 | 关键参数 / 请求体 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/docs/tree` | `path` 可选 | 返回目录节点，懒加载目录树使用 |
| `GET` | `/api/docs/file` | `path` 必填；`raw=1` 返回原文件流；`full=1` 返回完整文本 | 返回文件预览、原始文件或完整内容 |
| `GET` | `/api/docs/meta` | `path` 必填 | 返回文件或目录元信息 |
| `GET` | `/api/docs/export` | `path`、`format=doc\|docx` | 导出文档详情页 |
| `GET` | `/api/docs/stars` | `path` 可选 | 不传 `path` 返回全部星标，传 `path` 返回单文件星标状态 |
| `PATCH` | `/api/docs/stars` | JSON: `{ "path": "...", "isStarred": true }` | 更新文档星标状态 |
| `POST` | `/api/chat/conversations` | 无正文 | 创建独立空白聊天，返回 201 与空 `ChatHistoryPayload`，不调用模型 |
| `GET` | `/api/chat/history` | `path` 或 `conversationId` 必须且互斥；`beforeMessageId` 可选 | 默认返回最新一页；以既有消息 ID 加载更早一页，不触发模型请求 |
| `POST` | `/api/chat` | 文档：`{ "path": "...", "action": "summary" }` / `send` + `content` / `retry` + `messageId`；独立：`{ "conversationId": "...", "action": "send", "content": "..." }` / `retry` + `messageId` | 服务端读取对应 SQLite 历史后流式调用 DeepSeek；文档模式额外读取完整文档，独立模式不支持 summary |
| `GET` | `/api/search` | `q` 必填；`scope`、`type=all\|md\|code\|pdf`、`page`、`size`、`sort=relevance\|mtime` | 全文搜索 |
| `GET` | `/api/reviews` | `doc_path`、`status` 可选 | 历史审阅单列表 |
| `GET` | `/api/reviews/:id` | `id` | 审阅单详情 |
| `PATCH` | `/api/reviews/:id` | 审阅单可更新字段 | 推进历史审阅单状态 |
| `GET` | `/api/reviews/pr-files` | `category`、`read=all\|read\|unread`、`refresh=1` | PR 文件面板列表与分类 |
| `POST` | `/api/reviews/pr-files/read` | JSON: `{ "path": "..." }` | 标记 PR 文件已读 |

当前没有公开的创建审阅单或新增问题项 API。相关 service 中保留创建能力是历史兼容与后续扩展基础，前端入口和 API 暂不开放。

`summary` 只允许在服务端完整历史为空时生成；`send` 持久化用户消息后生成回答；`retry` 只能重试用户选中的 `stopped` 或 `error` 助手消息。`ChatHistoryPayload` 固定为 `{ conversationId: string | null, messages: Array<{ id: string, role: 'user' | 'assistant', content: string, status: 'pending' | 'streaming' | 'complete' | 'stopped' | 'error', error: string | null }>, isGenerating: boolean, documentChanged: boolean, hasMore: boolean }`。历史接口每页最多 40 条且最多 100,000 字符，`beforeMessageId` 使用现有消息 ID 作为 cursor。`/api/chat` 的 SSE 只包含 `{ type: 'history', history }`、`{ type: 'delta', messageId, text }`、`{ type: 'error', message, history? }`、`{ type: 'done', history }`；SSE 中的历史也始终是最新一页。接口不发送 `meta` 或内部 generation 信息。请求不接受客户端历史或文档正文；服务端按安全路径读取完整文档，并从 SQLite 组装对话上下文。每轮模型上下文最多 40 条、100,000 字符；更早消息仍保存在完整历史中，超过上下文窗口时界面提示“历史完整保存，本轮参考当前文档与最近对话”。接口执行文档、单条消息、单问题和 body 限制；超限返回明确错误，不做静默截断。生成片段先写入数据库再发给客户端；关闭或中断后由 GET 恢复，服务端不自动重放模型请求。没有配置 API 密钥时接口返回可读错误。

## 只读与安全

- docs 源文件只读访问，不提供在线编辑能力
- 所有 `path` 参数都经过 `normalize + resolve + root check`
- 禁止绝对路径、`..` 路径穿越与非法字符
- 命中 `DOCLENS_SEARCH_IGNORE` 的路径会被拒绝读取
- 审阅数据单独写入 SQLite，与 docs 内容隔离

## 数据库与状态模型

DocLens 的 SQLite 数据只服务于工作台状态，不改变 docs 源文件。

| 表 | 职责 |
| --- | --- |
| `review_sheets` | 历史审阅单主表 |
| `review_items` | 审阅单问题项 |
| `pr_review_files` | `docs/pr` 文件快照、分类、创建时间、最后同步时间 |
| `doc_states` | 文档状态 SSOT，保存星标、已读、更新时间 |
| `starred_docs` | 历史兼容表，迁移时回填到 `doc_states` |

文档聊天历史通过增量兼容迁移加入，共享 `DOCLENS_DB_PATH`。`chat_conversations` 按 canonical docs root + normalized path 唯一隔离，并保存内部 `generation_id` 与 lease metadata；`chat_messages` 保存 `position` 和 `parent_message_id`。历史与 docs 源文件分离，不会写回文件。当前无账号体系，因此各窗口共享项目级历史。内部 generation/lease metadata 不属于 API 响应合同；客户端只读取 `isGenerating`。

独立聊天新增 `standalone_chat_conversations` 与 `standalone_chat_messages`，按 canonical docs root 和会话 ID 隔离，复用消息状态、生成租约与持久化策略；既有文档聊天表和记录保留。当前顶部入口每次创建新会话，尚未提供独立聊天历史列表。

## 测试与冒烟

### 已有测试覆盖

- 路径安全与 docs 访问规则
- Markdown 预处理与安全清洗
- `rg` 输出解析
- 审阅状态机

### 冒烟步骤

1. 打开 `/docs`，确认目录树可以展开并按名称过滤。
2. 打开 Markdown 或代码文件，确认内容渲染、代码高亮和行号定位正常。
3. 在搜索页输入关键词，确认结果高亮并能跳转到命中文档。
4. 打开右侧 PR 文件面板，确认筛选、已读状态同步与审阅单跳转正常。
5. 在文档详情页切换星标，再到 `/reviews` 或 `/docs` 星标列表确认状态一致。
6. 打开支持的文本文件，点击详情页右上角 Chat 图标，确认先出现中文文档概述；发送问题后确认用户消息位于右侧、助手 Markdown 回答流式显示。
7. 在聊天中停止一次生成并重试一次；关闭后重新打开确认历史恢复、已完成概述不重复生成。检查移动端宽度下输入区与消息滚动正常。
8. 对无文本提取器的 PDF/二进制文件确认聊天不可用且提示清楚；未配置 DeepSeek 密钥时确认显示可读错误。
9. 使用一份小型文本文档执行实际首调：打开聊天，核对第一条中文概述能对应文档主题与关键内容；再提出两个连续问题，其中第二问引用第一问提到的内容，确认上下文连续且回答仍依据当前文档。
10. 分别验证 4,000 字符问题、32,000 字符单消息、512 KiB body，以及 524,288 字节/100,000 字符文档边界；超限应收到明确提示，不能静默截断文档。构造超过 40 条或 100,000 字符的聊天历史，确认历史完整保留，单轮上下文只取最近预算并显示“历史完整保存，本轮参考当前文档与最近对话”。
11. 在两个窗口同时打开同一文档，确认只发生一个概述生成；修改文档后重开聊天，确认历史保留且显示版本变化提示。
12. 测试停止、连接中断、超时及服务进程中断后的部分回答恢复；确认恢复只调用 GET，只有显式点击重试才再次生成。
13. 对超过一页的历史确认默认显示最新页；点击“加载更早的对话”后按消息 ID 追加上一页，`hasMore` 最终归零。确认发送和 SSE 完成仍回到最新页。
14. 分别提问流程/状态图和参数对比问题：前者适合时输出一张简洁 Mermaid 图，后者使用 Markdown 表格；流式期间显示“正在生成图表...”占位，消息完成、停止或出错后只渲染一次，语法错误或安全校验失败时源码仍可见。
15. 确认聊天图表没有外框与标题栏，内嵌区域最高为页面高度的 1/3，竖向与横向图表在桌面、手机及横屏尺寸下均按比例完整缩放，左上角放大按钮为 44px × 44px，悬停时没有 tooltip 提示，且不遮挡图表节点；放大后大图按自然尺寸显示，可横向和纵向平移且不会缩小到视口内。确认普通文档预览仍保持原有 Mermaid 外观。
16. 打开含 Mermaid 的长回复，等待图表完成后确认最后一行仍可见；上翻阅读后点击仅显示箭头的“回到底部”，确认滚动到实际末尾。输入多行草稿、缩小窗口或继续生成内容后仍跟随；上翻阅读时不抢滚动，操作滚动按钮时已渲染图表不重新挂载。
17. 不选择文档，点击顶部目录按钮左侧的“新建聊天”，确认空白全屏聊天可输入，创建 / 打开不发起生成请求；关闭后再次新建，确认使用不同会话 ID，原记录保留。发送问题后验证流式回答、停止和重试；桌面及 320px / 375px 手机宽度下导航与输入区无横向溢出。

### 收尾校验

```bash
pnpm test:run
pnpm build
```

只改文档时也建议执行 `pnpm build`，确保 README 中引用的运行边界没有掩盖实际编译问题。涉及 docs 访问、搜索或审阅状态的改动，还应补充对应单测或 API 冒烟。

## 常见问题

### `/search` 没有结果或报错

先确认 `rg --version` 可执行，再确认 `DOCLENS_DOCS_ROOT` 指向的目录存在。`project-root` 模式下搜索会强制收敛为 Markdown 文件，这是为了避免把整个仓库源码、构建产物和依赖目录纳入第一期搜索面。

### 配置了 `../repo/docs` 后路径为什么显示 `docs/...`

这是 `docs-directory` 模式的预期行为。内部读取使用 docs 内相对路径，复制路径、导出元信息和仓库内引用统一展示为 `docs/...`，便于回贴到产品仓文档。

### 星标或已读状态丢失

先确认 `DOCLENS_DB_PATH` 没有被切到新的 SQLite 文件。`data/` 是本地状态目录，不会提交到 Git；不同产品仓建议使用不同数据库文件名，避免状态混杂。

### PR 文件面板没有刷新

`/api/reviews/pr-files` 会启动文件监听；监听不可用时会在请求时做兜底同步。需要强制刷新时，请求可带 `refresh=1`，或在 UI 中使用刷新入口。

## 工程约束

- 需求与范围以 [`docs/prd/doclens_prd.md`](./docs/prd/doclens_prd.md) 为准
- 涉及重构时必须遵守“行为保持式重构（单文件职责拆分）”
- `fs`、`rg`、SQLite 等副作用逻辑应收敛在 `services/`
- 收尾必须执行构建校验：`pnpm build`
