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
3. **审阅提效**：右侧面板聚焦 `docs/pr` 文件检索（按日期目录筛选、已读状态），并支持历史审阅单查看与状态流转。
4. **工程约束**：服务端只读访问文档根目录，防路径穿越；结构清晰可测试。

### 2.2 迭代范围（P1/P2）

* P1：搜索索引化（更快）、PDF 文本索引、最近访问/收藏、快捷键
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
3. 在 `/docs` 右侧 PR 文件面板按日期目录筛选并打开文档，已读状态自动更新
4. 在审阅列表页查看历史审阅记录，并在详情页推进状态流转

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

  * 按日期目录筛选（`pr/<yyyymmdd>/...`）
  * 关键词搜索（路径/文件名）
* 交互：

  * 点击文件打开中间预览区
  * 文件打开后自动标记已读

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

---

## 7. 环境变量（.env）

### 7.1 命名规范

统一前缀：`DOCLENS_`

### 7.2 必要配置（P0）

```env
# 允许访问的文档根目录（只读）
DOCLENS_DOCS_ROOT=../adsynapse-smart-ads/docs

# SQLite 数据库路径
DOCLENS_DB_PATH=./data/doclens.sqlite

# 搜索实现（rg / index）
DOCLENS_SEARCH_PROVIDER=rg

# 搜索忽略（可选，逗号分隔）
DOCLENS_SEARCH_IGNORE=third_parties,node_modules,.git
```

> 说明：不建议用 `NEXT_PUBLIC_` 暴露这些路径到浏览器；只在 Server 端读取。

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
  4. 在右侧 PR 文件面板按日期筛选、打开文件并自动标记已读

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
4. 右侧 PR 文件面板可按日期筛选与搜索，按创建时间降序，已读状态可同步
5. 历史审阅单可查看并推进状态流转
6. 具备最小回归保护（单测 + 冒烟步骤）并符合职责拆分结构

---

## 12. 里程碑（建议）

* **M1**：Docs 浏览 + 预览 + 稳定路由定位
* **M2**：rg 全文搜索 + 高亮 + 过滤 + 跳转
* **M3**：PR 文件面板（SQLite 已读同步）+ 历史审阅列表页
* **M4**：体验增强（快捷键/收藏/索引化搜索/PDF 索引）

 
