# DocLens 需求文档 

## 0. 项目基本信息

* **项目名**：DocLens
* **定位**：面向代码仓库 `docs/` 的**文档浏览 + 全文搜索 + PRD/审阅单**提效系统（独立 Web 项目）
* **技术栈**：Next.js + TypeScript + MUI
* **原则**：遵守“行为保持式重构规范（单文件职责拆分）”，强调可回归、可复核、可扩展

---

## 1. 背景与痛点

在 `adsynapse-smart-ads` 仓库中，`docs/` 下存在大量文档（design/pr/logs/tools/product-guides/third_parties/pdf 等），存在如下问题：

1. **定位慢**：目录深、文件多，靠命令行/IDE 搜索效率不稳定。
2. **阅读体验弱**：Markdown/PDF/代码类文件预览分散，命中后跳转与上下文定位不顺畅。
3. **审阅不可追踪**：PRD、评审记录依赖聊天/口头/零散 md，缺少结构化审阅单、状态流转、问题闭环。
4. **复用与沉淀不足**：优秀审阅结论、风险清单、验收点无法形成可检索资产。

---

## 2. 目标与范围

### 2.1 产品目标（P0）

1. **浏览**：提供 docs 目录树浏览、文件预览（md/pdf/代码/文本）。
2. **搜索**：对 docs 内文本类文件进行**全文检索**，支持高亮与命中定位。
3. **审阅提效**：右侧面板聚焦 `docs/pr` 文件检索（按类别、已读状态筛选），并支持历史审阅单查看与状态流转。
4. **文档 AI 对话**：在详情页通过 DeepSeek 阅读当前文本文档，提供简洁中文概述与基于文档的多轮问答。
5. **工程约束**：服务端只读访问文档根目录，防路径穿越；结构清晰可测试。

### 2.2 迭代范围（P1/P2）

* P1：搜索索引化（更快）、PDF 文本索引、最近访问/收藏（星标）、快捷键
* P2：账号体系/权限、多人协作、导出审阅结果回写到仓库、与 PR/Issue 联动

### 2.3 明确不做（第一期不做）

* 不做在线编辑 docs 文件（只读）
* 不做复杂权限系统（先本地/内网）
* 不做多仓库聚合（仅一个 docs root）

---

## 3. 用户与场景

### 3.1 用户角色

* **Reader**：查找、阅读 docs 文档
* **Reviewer**：审阅 PRD / 设计文档，查看 PR 文件、给结论、跟踪关闭
* **Owner/Assignee**：接收问题项，修订文档，反馈已解决

### 3.2 核心使用场景

1. 打开 DocLens → 在目录树中找到 `docs/design/...` 并预览
2. 输入关键字（如 “worktree sop”、“upload wizard”、“unity rate limit”）→ 得到结果 → 点击直接打开并定位到命中处
3. 在 `/docs` 右侧 PR 文件面板按类别与已读状态筛选并打开文档，已读状态自动更新
4. 在审阅列表页查看历史审阅记录，并在详情页推进状态流转
5. 在文档详情或 PR 文件面板中将重点文件加入星标，并在审阅列表页集中回看
6. 在文档详情页打开 AI 对话，让 DeepSeek 先用易懂中文概述当前文档，再围绕文档内容连续提问

---

## 4. 信息架构（IA）与页面

### 4.1 全局布局（桌面端）

* **左侧**：Docs 目录树（可筛选/懒加载）
* **中间**：内容预览区（渲染/代码高亮/目录大纲）
* **右侧**：审阅面板（Drawer，可折叠）

### 4.2 路由规划

* `/` → 重定向 `/docs`
* `/docs`：主界面（树 + 预览 + 右侧审阅面板）
* `/docs/view?path=...`：单文件直达（可分享链接）
* `/search?q=...&scope=...&type=...`：全局搜索页（或做成 `/docs` 内联面板）
* `/reviews`：审阅单列表（过滤/排序）
* `/reviews/:id`：审阅单详情页

---

## 5. 功能需求（详细）

### 5.1 Docs 浏览（P0）

**FR-1 目录树**

* 展示 docs 根目录下的目录/文件
* 支持：

  * 懒加载子目录（点击展开才请求）
  * 名称过滤（仅过滤树节点）
  * 记住展开状态（localStorage）

**FR-2 文件预览**

* 支持类型：

  * Markdown `.md`：渲染（支持代码块、表格、任务列表、内链）
  * PDF `.pdf`：内嵌预览（翻页、缩放）
  * 代码/配置：`.ts/.tsx/.js/.json/.yaml/.yml/.sql/.sh` → 高亮 + 行号
  * 其他文本：纯文本（行号 + copy）
* 大文件策略：

  * 超过阈值（如 2MB）提示“按需加载/仅预览前 N 行”

**FR-3 稳定定位**

* 支持链接复现：

  * `path` 参数定位文件
  * `#L120` 行号定位
  * `#heading-xxx` 标题定位（Markdown）

**FR-4 常用快捷**

* 复制文件路径
* 打开原文件（显示本地路径/仓库路径即可，不做 OS 深度集成）
* 加入/取消文档星标，供审阅列表页集中查看
* 在详情页操作栏中，AI 对话按钮位于“加入星标”按钮左侧

---

### 5.2 全文搜索（P0）

**FR-5 搜索能力**

* 范围：默认 `DOCS_ROOT` 下所有文本类文件（md/code/txt/sql…）
* 输入：关键字（支持空格分词，默认 AND；后续可扩展 OR/引号）
* 输出：

  * 文件路径
  * 命中片段（前后文）
  * 命中数量
  * 高亮关键词
* 点击结果：

  * 打开对应文件并定位到命中行/段落

**FR-6 过滤与排序**

* 过滤：

  * 目录（design/pr/logs/tools/product-guides/…）
  * 文件类型（md / code / pdf / all）
* 排序：

  * 相关性（默认）
  * 最近修改时间（mtime）

**FR-7 缓存**

* 查询缓存：LRU（如 100 条）
* 防抖：输入 300ms 才触发搜索
* 分页：每页 20/50

> 第一阶段推荐实现：**Server 侧 ripgrep（rg）**，速度快，上线成本低。

---

### 5.3 审阅单（Review Sheet）（P0）

> 审阅单是结构化记录：用于 PRD/设计/评审，不修改源文档本体。

**FR-8 PR 文件面板（右侧 Drawer）**

* 数据来源：`docs/pr` 目录文件 + SQLite 已读状态
* 列表排序：按文件创建时间降序（`birthtime`，不可用时回退 `mtime`）
* 过滤能力：

  * 按类别筛选（`pr/<date>/<category>/...` 中的 `category`）
  * 按已读/未读筛选
* 交互：

  * 点击文件打开中间预览区
  * 文件打开后自动标记已读
  * 支持在列表内直接加入/取消星标

**FR-9 已读状态实时同步**

* 已读状态按 `file_path` 粒度存储（全局，不区分用户）
* 同步策略：

  * 文件监听（watch）增量更新
  * 面板请求前执行一次兜底对账，确保与文件系统最终一致

**FR-10 历史审阅单能力边界**

* 第一阶段下线“创建审阅单/创建问题项”入口
* 保留历史审阅单查看与状态流转
* 审阅单详情页问题项仅允许状态更新，不新增

**FR-11 状态流转（审阅单级别）**

* `Draft` → `In Review` → `Changes Requested` → `Approved` → `Done`
* 允许从 `Changes Requested` 回到 `In Review`
* `Done` 后仅允许查看（可 reopen：第二期）

**FR-12 关联展示**

* 文件页右侧展示“PR 文件列表（含已读状态）”
* 审阅单详情页展示“关联文件快捷跳转”

**FR-13 星标文档列表**

* 文档详情页与 PR 文件面板共享同一份文档星标状态
* 审阅列表页展示星标文档列表，按最近星标时间倒序
* 支持从星标列表直接打开文档、带入文档路径过滤、取消星标

**FR-14 文档 AI 对话**

* 入口：文档详情页右上角增加 Chat 图标按钮，放在“加入星标”左侧。
* 展示：点击后打开占满视口的全屏对话窗口，适配桌面和移动端；顶部显示当前文档并提供关闭操作，消息区占据主要空间并可独立滚动，输入区固定在底部。
* 初始概述：打开对话后先请求服务端历史。若该文档没有历史消息，才自动创建首条助手概述；若已有历史则恢复显示，不重复生成概述。助手须阅读服务端从当前安全路径读取的完整文本（不沿用预览截断），以简洁、易懂的中文概括文档主题、关键内容和关注点。若文档超出上游模型可处理范围，明确报错，不得静默截断后冒充完整文档分析。
* 多轮交互：支持连续提问与回答、流式显示、发送、停止生成、失败后重试、自动聚焦输入框、键盘发送，以及移动端输入和布局。用户问题显示为右侧气泡；助手回答占据对话内容区并以清晰的 Markdown 排版渲染，包含标题、列表、代码等结构时保持可读。每轮内容适合表达流程、关系或状态时，优先生成一张简洁的核心 Mermaid 图；每图建议不超过 6–8 个节点、关系简短，不为凑数绘制多张图。涉及对比、分类、映射、参数、字段或选项时优先使用紧凑 Markdown 表格；简单事实用短句回答。避免同时叠加图表、表格和重复的长篇解释。
* Mermaid 安全渲染：只渲染 Markdown 中明确标记的 Mermaid 代码块；渲染使用严格安全模式并对 SVG 输出做清洗，禁用任意 HTML、脚本、事件处理器和交互回调。待渲染的 Mermaid 块仍在流式生成时显示“正在生成图表...”占位，不频繁解析或重绘源码；消息进入 `complete`、`stopped` 或 `error` 后再安全渲染一次。解析或安全校验失败时显示原始 Mermaid 源码和可读错误，不丢弃源码。
* 聊天图表展示：聊天使用 Mermaid renderer 的 `presentation="chat"`，不显示外部卡片轮廓或 Mermaid 标题栏，图表区域仅显示 SVG；右上角放置 44px × 44px 放大按钮。放大预览按 SVG 自然宽高呈现，不缩小以适配视口，并允许横向、纵向平移；大于视口的图表（例如 375px 宽）保持自然尺寸。普通文档预览继续使用 renderer 默认的 `presentation="document"`，保持原有 Mermaid 外观。
* 文档上下文：浏览器只提交经过应用路由编码的文档 `path` 和当前动作，不提交文档正文或历史消息。服务端每轮调用（summary/send/retry）都依照 docs API 相同的根目录、路径归一化、穿越和忽略目录规则校验 `path`，重新只读加载当前完整文本文档，并通过固定的服务端 system prompt 将完整原文作为上下文发送给 DeepSeek。历史及分页预算只约束聊天消息，不得裁剪或替换原文。客户端不能指定历史角色、system 指令或可信文档内容。
* 文件类型：当前没有文本提取能力的 PDF 或二进制文件不可发起对话；入口应禁用或在打开时清楚说明暂不支持，不得将原始二进制内容发送给模型。支持类型以服务端实际文本读取能力为准。
* 持久历史：按 canonical docs root 与规范化文档相对路径隔离，每个文档详情页恢复自己的聊天历史。当前没有账号体系，聊天属于项目级全局状态；关闭或重开窗口不删除历史。历史通过服务端 SQLite 保存到 `DOCLENS_DB_PATH`，不写回 docs，不存入 localStorage/sessionStorage。新增聊天表须通过向后兼容的数据库迁移加入，不重置已有审阅、已读、星标或 PR 文件状态。
* 恢复与文档变化：每次打开先调用 `GET /api/chat/history?path=...` 恢复消息和生成状态。首次且历史为空时才调用 `POST /api/chat` 的 `summary` 动作。服务端记录产生历史时的文档版本指纹；若文档后续变化，保留原有消息并在界面提示版本已变化，不自动清空或重新总结；后续新请求由服务端读取当前完整文本，并清楚标记使用了更新后的文档。
* 并发与中断：服务端以 canonical docs root + normalized path 为键建立 SQLite generation lease，同一文档同时只允许一个上游生成任务，防止多窗口重复概述和并发收费。每个增量先持久化，再发送 SSE。停止、关闭聊天、连接掉线、超时和服务进程中断都须保存已生成的部分内容及终止状态；可见消息状态统一为 `pending`、`streaming`、`complete`、`stopped`、`error`，错误原因写入消息的 `error` 字段。重新打开只恢复历史/状态，不自动重放请求；仅用户显式点击重试才允许再次调用模型。失败、停止、超时或中断的助手消息仍保留，重试追加新的助手尝试并关联原消息。
* 历史与上下文：SQLite 保存完整聊天历史，不因模型上下文上限删除旧消息，不设 20 轮等永久对话上限。每轮模型请求最多带入最近 40 条聊天消息且最多 100,000 字符；超出部分只从本轮聊天历史上下文中排除，数据库中的旧历史继续保留。文档完整原文每轮仍按固定 system prompt 提供，不受聊天上下文窗口或历史分页预算裁剪。存在未带入本轮对话上下文的旧历史时，界面清楚提示：“历史完整保存，本轮参考当前文档与最近对话”。
* 外部发送：打开聊天会先恢复历史；只有首次空历史自动生成概述，或用户显式发送问题/点击重试时，才向配置的外部 DeepSeek 服务发送文本。界面需清楚说明文档与问题会发送到该服务。
* 配置与错误：DeepSeek 凭证仅能由服务端环境变量提供；未配置凭证时，API 返回可读错误，界面向用户显示明确提示。密钥不得传到浏览器。

**FR-15 文档对话 API**

* 历史载荷：`ChatHistoryPayload = { "conversationId": string | null, "messages": ChatMessage[], "isGenerating": boolean, "documentChanged": boolean, "hasMore": boolean }`，其中 `ChatMessage = { "id": string, "role": "user" | "assistant", "content": string, "status": "pending" | "streaming" | "complete" | "stopped" | "error", "error": string | null }`。
* 历史读取：`GET /api/chat/history?path=...&beforeMessageId=...`。`beforeMessageId` 可选，分页时取当前最早消息的既有 `id`，读取更早消息，不引入额外 cursor token。每页最多 40 条且合计最多 100,000 字符；默认返回最新一页，`hasMore` 表示仍有更早历史，`conversationId` 标识该文档的既有会话。无历史时 `conversationId: null`、`messages: []`、`isGenerating: false`、`hasMore: false`；读取操作不会触发 DeepSeek 请求。接口只暴露 `isGenerating` 布尔值，不返回内部 generation lease、上游原始 token 或 `meta` 数据。UI 提供“加载更早的对话”。
* 流式写入：`POST /api/chat` 请求体为以下互斥联合之一：`{ "path": string, "action": "summary" }`、`{ "path": string, "action": "send", "content": string }`、`{ "path": string, "action": "retry", "messageId": string }`。`summary` 仅在服务端确认当前历史为空时生成；`send` 将用户消息持久化后生成回答；`retry` 只重试指定的、属于当前文档且状态为 `stopped` 或 `error` 的助手消息。客户端不得发送可替换服务端历史的 `messages` 或文档正文。
* 去重与并发：所有生成动作先竞争同一文档的数据库 generation lease。已有有效 lease 时拒绝新的上游调用并返回可读忙碌状态；已有历史时重复的 `summary` 只返回已存历史，不产生新的上游调用。generation lease 必须可在事务中原子获取和释放；遗留的运行中状态在进程恢复后标为 `interrupted`，不得自动重新 POST。
* SSE 响应：`text/event-stream` 仅发送以下 JSON 事件：`{ "type": "history", "history": ChatHistoryPayload }`、`{ "type": "delta", "messageId": string, "text": string }`、`{ "type": "error", "message": string, "history"?: ChatHistoryPayload }`、`{ "type": "done", "history": ChatHistoryPayload }`。流式 `history` 和 `done`/`error` 中的历史均为最新页。每条增量先持久化再发送；不发送 `meta` 事件或内部 generation 信息。
* 服务端配置：`DOCLENS_DEEPSEEK_API_KEY`（必填；无默认值）、`DOCLENS_DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）、`DOCLENS_DEEPSEEK_MODEL`（默认 `deepseek-flash`）、`DOCLENS_DEEPSEEK_TIMEOUT_MS`（默认 `120000`）。这些值仅由服务端读取；前端不得暴露密钥或配置值。模型默认值以 [DeepSeek 官方首次调用文档](https://api-docs.deepseek.com/zh-cn/) 为准。
* 输入限制：单条新问题最多 4,000 字符；每条持久消息最多 32,000 字符；每轮模型上下文最多 40 条消息且合计最多 100,000 字符，按最新消息选取，不据此删除持久历史；请求 JSON body 最多 512 KiB。
* 文档限制：服务端只接受不超过 524,288 字节且不超过 100,000 字符的文本文件。任一限制超出时返回明确提示，禁止静默截断或只传入部分文档后声称已阅读全文。

---

## 6. 数据与存储（P0）

### 6.1 数据库

* 建议 SQLite（单机部署简单）
* `.env` 配置 DB 路径

### 6.2 数据模型（简化）

**review_sheets**

* `id`（uuid）
* `title`
* `doc_path`
* `doc_type`
* `status`
* `conclusion`
* `summary`
* `owner`
* `reviewer`
* `created_at` / `updated_at`

**review_items**

* `id`
* `sheet_id`
* `severity`（P0/P1/P2）
* `description`
* `suggestion`
* `assignee`
* `due_date`（nullable）
* `state`（Open/Resolved/WontFix）
* `created_at` / `updated_at`

**pr_review_files**

* `path`（主键，`pr/...`）
* `name`
* `date_folder`（如 `20260207`）
* `created_at` / `modified_at`
* `is_read`（boolean）
* `read_at`（nullable）
* `last_seen_at`（用于同步清理）

**starred_docs**

* `path`（主键，任意 docs 文件相对路径）
* `name`
* `starred_at`

**文档聊天历史**

* `chat_conversations` 以 canonical docs root 与 normalized 文档相对路径建立唯一隔离；保存内部 `generation_id` 和 lease metadata，用于生成去重与租约协调。
* `chat_messages` 保存消息顺序（`position`）及父消息关联（`parent_message_id`），支撑持久历史与重试关系。
* 聊天迁移须为增量迁移，保留现有表与数据；聊天历史保存在 `DOCLENS_DB_PATH` 对应 SQLite 中，并与只读 docs 源文件隔离。服务端 generation/lease metadata 不属于公开 API。

---

## 7. 环境变量（.env）

### 7.1 命名规范

统一前缀：`DOCLENS_`

### 7.2 必要配置（P0）

```env
# 允许访问的文档根目录（只读），可配置为产品仓库根目录或产品仓库 docs 目录
DOCLENS_DOCS_ROOT=../adsynapse-smart-ads/docs

# SQLite 数据库路径
DOCLENS_DB_PATH=./data/doclens.sqlite

# 搜索实现（rg / index）
DOCLENS_SEARCH_PROVIDER=rg

# 搜索/目录忽略（可选，逗号分隔）
DOCLENS_SEARCH_IGNORE=third_parties,node_modules,.git,.next,.turbo,dist,build,coverage

# 文档 AI 对话（密钥仅在服务端配置；不要使用 NEXT_PUBLIC_ 前缀）
DOCLENS_DEEPSEEK_API_KEY=
DOCLENS_DEEPSEEK_BASE_URL=https://api.deepseek.com
DOCLENS_DEEPSEEK_MODEL=deepseek-flash
DOCLENS_DEEPSEEK_TIMEOUT_MS=120000
```

> 说明：不建议用 `NEXT_PUBLIC_` 暴露这些路径到浏览器；只在 Server 端读取。若 `DOCLENS_DOCS_ROOT` 指向产品仓库根目录且根目录下存在 `docs/`，服务端以项目根为只读范围，跟踪仓库内 Markdown 文件，包含 `.codex`、`.agents` 等隐藏文档目录，并通过 `DOCLENS_SEARCH_IGNORE` 排除 `.git`、`node_modules`、`.next` 等目录。若 `DOCLENS_DOCS_ROOT` 直接指向 `path/to/product_root/docs`，复制路径与导出路径会补齐仓库相对前缀 `docs/...`。

文档 AI 对话使用上述 `DOCLENS_DEEPSEEK_*` 服务端配置。未配置 `DOCLENS_DEEPSEEK_API_KEY` 时，聊天接口应返回可读配置错误；密钥不得进入客户端 bundle、响应或日志。

---

## 8. 安全与合规（必须）

**NFR-S1 路径安全**

* 对 `path` 参数做 normalize
* 必须 `resolvedPath.startsWith(DOCS_ROOT_RESOLVED)`
* 禁止 `..`、绝对路径
* 可选：禁止符号链接逃逸（realpath 校验）

**NFR-S2 只读**

* 所有 API 不提供写 docs 能力
* 审阅数据写入 SQLite（与 docs 分离）

**NFR-S3 AI 对话边界**

* `/api/chat` 必须在服务端重新校验文档相对路径，并在服务端读取完整文本；不得接受客户端提供的文档正文作为可信上下文。
* DeepSeek 凭证只在服务端读取；传输前不得把密钥写入日志，向客户端返回的错误中不得包含凭证或上游敏感响应。
* AI 聊天消息只写入 `DOCLENS_DB_PATH` 的 SQLite 聊天表，不修改 docs 源文件，也不存入 localStorage/sessionStorage。SQLite 聊天数据与 docs 只读边界分离。
* 当前无账号系统，聊天历史沿用项目级全局状态边界，按 canonical docs root + normalized path 隔离。
* 用户首次打开空历史、显式发送问题或点击重试时才向配置的外部 DeepSeek 服务发送文本；恢复已有历史通过 GET 完成，不产生外部调用。界面须说明文档及问题会发送到该服务。
* 同一文档的生成须持有 SQLite generation lease；多窗口请求不能造成并发上游调用或重复首条概述。
* 取消、掉线、超时或进程中断须保留已生成文本与状态；恢复通过 GET 完成，不自动重放 POST。重试仅由用户显式点击触发。
* 接口须执行 FR-15 的请求体、单消息、历史消息数、历史字符数、单问题和文档大小限制；超限时返回明确错误，不得截断文档或历史后继续生成。

---

## 9. 性能与体验指标（P0 验收口径）

* 目录树展开：< 200ms（本地/内网）
* 文件打开：< 500ms（普通 md）
* 搜索：首屏结果 < 2s（rg，视 docs 规模）
* 审阅单创建：< 300ms

---

## 10. 工程落地规范：行为保持式重构（强制）

> DocLens 自身开发也遵守该规范；同时对未来迭代（如从 rg → index）也按此推进。

### 10.1 回归保护（必须）

* 单测：

  * 路径穿越防护
  * 忽略目录规则
  * rg 输出解析（domain 纯函数）
* 冒烟步骤文档（写入 `README.md`）：

  1. 打开 `/docs`，展开目录
  2. 打开 md 文件并渲染
  3. 搜索关键词并跳转命中
  4. 在右侧 PR 文件面板按类别/已读状态筛选、打开文件并自动标记已读

### 10.2 小步可回退

* 每个 PR 只做一种动作（比如“新增 rg 搜索 API”/“新增 review drawer UI”）
* 每步提交后立即跑冒烟/测试

### 10.3 单文件职责拆分（建议目录）

* `features/docs/{ui,domain,services}`
* `features/search/{ui,domain,services}`
* `features/reviews/{ui,domain,services}`
* `shared/{ui,domain,utils}`

### 10.4 副作用收敛

* `fs / child_process / db` 仅存在于 `services`
* `domain` 必须可纯函数单测
* UI 只负责展示与交互，不直接做 IO

---

## 11. 验收标准（P0）

1. Web 可浏览 docs 目录树（懒加载）
2. 可预览 md/pdf/代码文本
3. 可全文搜索 docs 文本类文件，高亮命中并可跳转定位
4. 右侧 PR 文件面板可按类别与已读状态筛选，按创建时间降序，已读状态可同步
5. 历史审阅单可查看并推进状态流转
6. 具备最小回归保护（单测 + 冒烟步骤）并符合职责拆分结构
7. 文档详情操作栏中的 Chat 图标位于加入星标左侧；文本文件可打开全屏聊天并首先获得基于完整文档的简洁中文概述
8. 打开已有聊天记录的详情页时先恢复 SQLite 历史，不重复调用概述；多窗口对同一文档打开时，generation lease 防止重复概述与并发上游调用
9. 聊天支持 Markdown 助手回答、右侧用户气泡、多轮流式提问、停止、重试、键盘与移动端交互；停止、掉线、超时、关闭和进程中断后保留 partial/status，恢复仅 GET，不自动重发
10. 文档变更后保留历史并提示；新请求按当前文档内容建立上下文
11. `/api/chat/history` 返回 `ChatHistoryPayload`；SSE 仅有 history/delta/error/done，delta 带 messageId，done 带最终历史，不向客户端暴露内部 generation 信息
12. `/api/chat/history` 与 `/api/chat` 按 canonical docs root + normalized path 隔离历史；聊天只持久化到 `DOCLENS_DB_PATH` 的 SQLite，通过增量兼容迁移实现；不改 docs 源文件、不写浏览器持久存储
13. 不支持提取的 PDF/二进制文档显示清楚的不支持状态；凭证仅服务端配置，缺失凭证时返回明确可读错误
14. 问题、单条消息和 body 分别遵守 4,000 字符、32,000 字符与 512 KiB 限制；每轮模型上下文和历史分页分别最多 40 条/100,000 字符；完整 SQLite 历史不因上下文预算被删除。文档同时遵守 524,288 字节和 100,000 字符限制，超限清楚提示且不得静默截断
15. 对话历史默认恢复最新页；超过一页时可用既有 message ID 加载更早记录，`hasMore` 正确反映剩余历史；发送和 SSE 完成后仍返回最新页
16. 当内容适合图示时，回答优先一张 6–8 节点以内的 Mermaid 核心图；比较、分类、映射或参数问题优先紧凑 Markdown 表格；流式期间显示图表生成占位，消息完成/停止/出错后渲染一次；图表解析/安全失败时源码可见且无可执行 HTML/SVG
17. 聊天 Mermaid 无外框和标题栏，只显示 SVG，右上角放置 44px 放大按钮；放大后按自然尺寸显示并支持横纵平移。普通文档预览继续使用 `presentation="document"` 的原有外观

---

## 12. 里程碑（建议）

* **M1**：Docs 浏览 + 预览 + 稳定路由定位
* **M2**：rg 全文搜索 + 高亮 + 过滤 + 跳转
* **M3**：PR 文件面板（SQLite 已读同步）+ 历史审阅列表页
* **M4**：体验增强（快捷键/收藏/索引化搜索/PDF 索引/文档详情页 DeepSeek AI 对话）

 
