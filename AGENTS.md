 
# 📌 DocLens 仓库指南

> **适用范围**：DocLens 独立 Web 项目（Next.js + TypeScript + MUI）
> **核心目标**：流程可追溯、产物一致、构建必过；严格遵守“行为保持式重构（单文件职责拆分）”；保障 docs 访问只读与路径安全。

---

## 0. Agent 输出要求（团队协作约束）

- **所有任务执行结果**（进度、结论、总结、风险、验证记录等）必须**使用中文**输出，便于团队同步。
- **极度重要**：只要代码有更新，收尾务必做一次**构建校验**，避免编译问题漏到 PR：
  - 前端构建：`pnpm build`
- **简报文档保存位置**：若未特别指明需要生成并保存简报的路径，则默认将简报保存在：
  - `docs/logs/YYYYMMDD/system`  
  - 文件名：`T<yymmddHHMM>-<name>.md`

---

## 1. 项目定位与约束（SSOT）

### 1.1 项目定位（来自 PRD）
DocLens 提供：
1) **浏览**：目录树浏览 docs、文件预览（md/pdf/代码/文本）  
2) **搜索**：对 docs 文本类文件全文检索（P0 采用 `rg`），支持高亮与命中定位  
3) **审阅提效**：PRD 审阅/审阅单（Review Sheet）创建、结构化记录、状态流转、关联文档（SQLite）

### 1.2 SSOT（Single Source of Truth）
- DocLens 的需求与范围以 `docs/prd/doclens_prd.md` 为唯一事实来源（SSOT）。
- 所有实现与派生文档必须与 SSOT 保持一致；若发现不一致，先修 SSOT 再修实现。

---

## 2. 环境变量（.env 规范）

统一前缀：`DOCLENS_`（默认只在 Server 侧读取，不对浏览器暴露）

建议 `.env` 示例：

```env
# 允许访问的文档根目录（只读）
DOCLENS_DOCS_ROOT=../adsynapse-smart-ads/docs

# SQLite 数据库路径（审阅单存储）
DOCLENS_DB_PATH=./data/doclens.sqlite

# 搜索实现：rg / index（第一期默认 rg）
DOCLENS_SEARCH_PROVIDER=rg

# 搜索忽略（逗号分隔）
DOCLENS_SEARCH_IGNORE=third_parties,node_modules,.git
````

**安全要求**：无论 env 怎么配置，服务端仍必须做路径归一化与根目录校验，严禁路径穿越。

---

## 3. 全局硬门槛：行为保持式重构（单文件职责拆分）

目标：在不改变外部可观察行为前提下拆分职责，降低耦合、提升可读性与可测试性。

必须遵守：

1. **先钉住行为**：先补最小回归保护（单测/冒烟脚本/验证步骤 + 关键断言）
2. **小步可回退**：一次只做一种重构动作，每一步立刻验证
3. **按变化原因拆分**：以“为何变化”来划分模块
4. **收敛副作用**：IO/请求/缓存/全局状态隔离，核心逻辑尽量纯函数化
5. **命名与边界优先**：先命名概念再决定文件归属
6. **保持接口稳定**：如必须变更，提供迁移策略
7. **交付可复核**：说明改动、原因、影响文件、验证方法、风险点、回滚/后续建议

---

## 4. 模块与目录组织（建议约定）

为保证“单一变化原因”，建议按 feature 分层：

* `src/features/docs/`

  * `ui/`：目录树、预览器、面包屑、大纲等纯组件
  * `domain/`：路径解析、过滤规则、渲染前处理（纯函数优先）
  * `services/`：文件系统读取（fs）、安全校验等 IO
* `src/features/search/`

  * `domain/`：query 解析、过滤、结果高亮（纯函数）
  * `services/`：`rg` 执行、缓存、分页等 IO
  * `ui/`：搜索框、结果列表、过滤器组件
* `src/features/reviews/`

  * `domain/`：状态机、字段校验（纯函数）
  * `services/`：SQLite 读写
  * `ui/`：Review Drawer、表单、列表、详情页
* `src/shared/`

  * `domain/`：可复用纯逻辑（例如 debounce、LRU、format）
  * `ui/`：通用组件
  * `utils/`：非业务工具（严格避免隐藏副作用）

**副作用收敛要求**：

* `fs / child_process(rg) / sqlite` 只能出现在 `services/`
* UI 层不得直接读文件/跑命令/读写 DB
* domain 层尽量纯函数可测

---

## 5. 构建、测试与开发命令

### 5.1 依赖安装

```bash
pnpm install
```

### 5.2 本地开发（可选）

```bash
pnpm dev
```

### 5.3 构建校验（收尾必做）

```bash
pnpm build
```

### 5.4 测试（按项目现状逐步补齐）

* 单测框架以项目既有配置为准（如 Vitest/Jest）
* 最少应覆盖：

  * 路径穿越防护（sanitize/normalize/root check）
  * 搜索结果解析与高亮（domain 纯函数）
  * Review 状态机流转（domain 纯函数）

---

## 6. 只读与安全（必须）

### 6.1 只读原则

* DocLens **不提供**对 docs 源文件的在线编辑/写入能力（第一期）
* 审阅单等结构化数据写入 SQLite（与 docs 分离）

### 6.2 路径安全（强制）

* 所有 `path` 参数：

  * 必须 `resolve + normalize`
  * 必须校验 `resolvedPath.startsWith(resolvedDocsRoot)`
  * 禁止 `..`、绝对路径
  * 建议：`realpath` 防止符号链接逃逸（可选加强）

---

## 7. 全局 UI 与 MUI 约定

* UI 框架：MUI（Material UI）
* 页面布局：

  * 左：目录树（懒加载）
  * 中：内容预览（md/pdf/代码/文本）
  * 右：审阅面板 Drawer（可折叠）
* 交互优先级：

  * P0：浏览 + 搜索 + 审阅单基础能力可用
  * P1：快捷键、最近访问/收藏、索引化搜索、PDF 文本索引

---

## 8. API 约定（DocLens 内部）

DocLens 的 API 以“只读 docs + 搜索 + 审阅单”为核心，建议按语义拆分（示例）：

* Docs

  * `GET /api/docs/tree?path=...`
  * `GET /api/docs/file?path=...`
* Search

  * `GET /api/search?q=...&scope=...&type=...&page=...`
* Reviews

  * `POST /api/reviews`
  * `GET /api/reviews?doc_path=...`
  * `GET /api/reviews/:id`
  * `PATCH /api/reviews/:id`
  * `POST /api/reviews/:id/items` 等

**注意**：API 只是建议，实际以代码与 PRD 为准；任何变更必须同步 `docs/prd/doclens_prd.md`。

---

## 9. Commit 与 PR 指南（交付可复核）

* 每次更新后请提交 commit，避免遗留未提交文件
* 建议遵循 Conventional Commits：`feat:` / `fix:` / `chore:` / `refactor:` 等
* PR 必含：

  * 变更说明（对齐 PRD 哪条）
  * 验证步骤与证据（至少 `pnpm build` 输出）
  * 风险点与回滚方式
  * 若涉及重构：说明“行为保持”策略、关键断言、测试覆盖点

---

## ✅ 最终收尾硬门槛（每个任务必须满足）

1. 行为保持式重构规范已遵守（如涉及拆分/重构）
2. 变更已提交 commit
3. 构建校验已执行并记录：`pnpm build`
4. 若涉及 docs 访问与搜索：路径安全与只读约束已通过验证
5. 若涉及审阅单：SQLite 读写路径与迁移策略（如有）已说明

 