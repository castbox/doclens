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

# SQLite 数据库路径
DOCLENS_DB_PATH=./data/doclens.sqlite

# 搜索实现：当前默认 rg
DOCLENS_SEARCH_PROVIDER=rg

# 搜索/目录忽略目录（逗号分隔）
DOCLENS_SEARCH_IGNORE=third_parties,node_modules,.git,.next,.turbo,dist,build,coverage

# 单文件预览大小上限（字节）
DOCLENS_MAX_FILE_PREVIEW_BYTES=2097152

# 单文件预览最大行数
DOCLENS_MAX_FILE_PREVIEW_LINES=500
```

### 4. 初始化数据库

```bash
pnpm db:migrate
```

`db:migrate` 会创建审阅单、PR 文件快照、历史星标兼容表与统一文档状态表。已有旧数据时，会从 `starred_docs` 与 `pr_review_files` 回填到 `doc_states`。

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

说明：

- 这些变量默认只在服务端读取，不应使用 `NEXT_PUBLIC_` 暴露到浏览器。
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
| `GET` | `/api/search` | `q` 必填；`scope`、`type=all\|md\|code\|pdf`、`page`、`size`、`sort=relevance\|mtime` | 全文搜索 |
| `GET` | `/api/reviews` | `doc_path`、`status` 可选 | 历史审阅单列表 |
| `GET` | `/api/reviews/:id` | `id` | 审阅单详情 |
| `PATCH` | `/api/reviews/:id` | 审阅单可更新字段 | 推进历史审阅单状态 |
| `GET` | `/api/reviews/pr-files` | `category`、`read=all\|read\|unread`、`refresh=1` | PR 文件面板列表与分类 |
| `POST` | `/api/reviews/pr-files/read` | JSON: `{ "path": "..." }` | 标记 PR 文件已读 |

当前没有公开的创建审阅单或新增问题项 API。相关 service 中保留创建能力是历史兼容与后续扩展基础，前端入口和 API 暂不开放。

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

长期扩展“最近访问”“置顶”“收藏分组”等用户状态时，应优先扩展 `doc_states` 或新增围绕文档状态的表，不要把状态重新写回 PR 文件快照。

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
