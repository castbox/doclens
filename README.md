# DocLens

DocLens 是一个面向仓库 `docs/` 目录的独立 Web 项目，聚焦三件事：

- 文档浏览：目录树、面包屑、文件预览、行号与标题定位
- 全文搜索：基于 `ripgrep (rg)` 的文本类文件检索、高亮与命中跳转
- 审阅提效：PR 文件面板、历史审阅单查看、状态流转与 SQLite 存储

项目以 [`docs/prd/doclens_prd.md`](./docs/prd/doclens_prd.md) 为唯一需求事实来源（SSOT），并遵守“只读 docs、路径安全、行为保持式重构”的工程约束。

## 技术栈

- Next.js 14（App Router）
- React 18
- TypeScript
- MUI 5
- SQLite + Drizzle ORM
- ripgrep (`rg`)
- Vitest

## 当前能力

### 文档浏览

- 左侧目录树懒加载，支持筛选
- 中间预览区支持 Markdown、代码/文本、PDF
- 支持通过 `path`、`#L120`、`#heading-xxx` 做稳定定位
- 支持文档导出接口

### 搜索

- 默认使用 `rg` 对 docs 根目录内文本类文件做全文检索
- 支持命中片段、高亮、分页与条件过滤
- 搜索结果可直接跳转到文件与命中位置

### 审阅

- 提供 PR 文件面板与已读状态同步
- 提供历史审阅单列表与详情页
- 支持审阅单和问题项的状态流转

## 项目结构

```text
app/                     Next.js 路由与 API
src/features/docs/       文档浏览相关 domain / services / ui
src/features/search/     搜索相关 domain / services / ui
src/features/reviews/    审阅相关 domain / services / ui
src/shared/              共享逻辑、组件、工具
db/                      Drizzle schema、数据库客户端、迁移脚本
docs/prd/                PRD 与项目文档
```

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

在项目根目录创建 `.env`，可直接使用下面模板：

```env
# 允许访问的文档根目录（只读）
DOCLENS_DOCS_ROOT=../adsynapse-smart-ads/docs

# SQLite 数据库路径
DOCLENS_DB_PATH=./data/doclens.sqlite

# 搜索实现：当前默认 rg
DOCLENS_SEARCH_PROVIDER=rg

# 搜索忽略目录（逗号分隔）
DOCLENS_SEARCH_IGNORE=third_parties,node_modules,.git

# 单文件预览大小上限（字节）
DOCLENS_MAX_FILE_PREVIEW_BYTES=2097152

# 单文件预览最大行数
DOCLENS_MAX_FILE_PREVIEW_LINES=500
```

### 3. 初始化数据库

```bash
pnpm db:migrate
```

### 4. 启动开发环境

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
| `DOCLENS_DOCS_ROOT` | 是 | `./docs` | 文档根目录，只允许只读访问 |
| `DOCLENS_DB_PATH` | 是 | `./data/doclens.sqlite` | SQLite 数据库文件路径 |
| `DOCLENS_SEARCH_PROVIDER` | 否 | `rg` | 搜索实现，当前项目默认 `rg` |
| `DOCLENS_SEARCH_IGNORE` | 否 | `third_parties,node_modules,.git` | 搜索时忽略的目录 |
| `DOCLENS_MAX_FILE_PREVIEW_BYTES` | 否 | `2097152` | 单文件预览字节上限，超出后走截断策略 |
| `DOCLENS_MAX_FILE_PREVIEW_LINES` | 否 | `500` | 单文件预览最大行数 |

说明：

- 这些变量默认只在服务端读取，不应使用 `NEXT_PUBLIC_` 暴露到浏览器。
- 即使环境变量被错误配置，服务端仍会对路径做归一化与根目录校验。

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

- `GET /api/docs/tree`
- `GET /api/docs/file`
- `GET /api/docs/meta`
- `GET /api/docs/export`
- `GET /api/search`
- `GET /api/reviews`
- `GET /api/reviews/:id`
- `PATCH /api/reviews/:id`
- `GET /api/reviews/pr-files`
- `POST /api/reviews/pr-files/read`

## 只读与安全

- docs 源文件只读访问，不提供在线编辑能力
- 所有 `path` 参数都经过 `normalize + resolve + root check`
- 禁止绝对路径、`..` 路径穿越与非法字符
- 审阅数据单独写入 SQLite，与 docs 内容隔离

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

## 工程约束

- 需求与范围以 [`docs/prd/doclens_prd.md`](./docs/prd/doclens_prd.md) 为准
- 涉及重构时必须遵守“行为保持式重构（单文件职责拆分）”
- `fs`、`rg`、SQLite 等副作用逻辑应收敛在 `services/`
- 收尾必须执行构建校验：`pnpm build`
