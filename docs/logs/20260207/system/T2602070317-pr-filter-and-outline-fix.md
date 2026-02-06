# 任务简报：PR 文件面板筛选调整 + 文档大纲跳转修复

## 1. 需求
- PR 文件面板筛选项改为：按类别、按已读/未读。
- 修复中间文档大纲点击后无法跳转到对应标题的问题。

## 2. 实现内容
### 2.1 PR 文件面板筛选
- 数据模型新增 `category` 字段（`pr_review_files`）：
  - `db/schema.ts`
  - `db/migrate.ts`
  - 兼容旧库：自动尝试 `ALTER TABLE` 补列。
- PR 文件同步逻辑新增类别提取：`pr/<date>/<category>/...` 中的 `category`。
- API 调整：
  - `GET /api/reviews/pr-files?category=...&read=all|read|unread`
  - 返回 `categories` 列表。
- 前端面板筛选控件改为：
  - `类别`
  - `已读状态（全部/已读/未读）`

### 2.2 文档大纲跳转修复
- 根因：大纲 `slug` 生成规则与正文标题 `id` 不一致，导致无法定位。
- 修复策略：
  - 在 `src/features/docs/domain/markdownHeading.ts` 引入统一标题提取与 slug 生成（`github-slugger`）。
  - `DocPreview` 与 `DocOutline` 共享同一套 heading 数据。
  - Markdown 渲染时显式为 `h1~h6` 绑定统一 `id`。
  - hash 定位增加多重匹配（原值/规范化/heading 映射）。

## 3. 影响文件
- `app/api/reviews/pr-files/route.ts`
- `db/schema.ts`
- `db/migrate.ts`
- `src/features/reviews/services/prFilesRepo.ts`
- `src/features/reviews/ui/ReviewDrawer.tsx`
- `src/features/reviews/domain/types.ts`
- `src/features/docs/domain/markdownHeading.ts`
- `src/features/docs/ui/DocOutline.tsx`
- `src/features/docs/ui/DocPreview.tsx`
- `docs/prd/doclens_prd.md`
- `package.json`
- `pnpm-lock.yaml`

## 4. 验证
- 构建：`pnpm build` 通过。
- 单测：`pnpm test:run` 通过（3 files / 8 tests）。

## 5. 备注
- 该修复保持 docs 只读与路径安全策略不变。
