# 任务简报：修复 pr_review_files category 重复加列报错

## 问题
执行迁移时报错：
`Failed to run the query 'ALTER TABLE pr_review_files ADD COLUMN category TEXT NOT NULL DEFAULT 'uncategorized';'`

## 根因
- 目标数据库已存在 `category` 列。
- Drizzle 会将底层 `duplicate column name` 错误包装为 `DrizzleError`，外层 message 不是原始 SQLite message。
- 现有 catch 仅检查 `error.message`，未检查 `error.cause.message`，导致未命中“重复列”分支。

## 修复
- 新增统一错误识别函数 `isDuplicateColumnError`，同时检查：
  - `error.message`
  - `error.cause.message`
- 应用到：
  - `db/migrate.ts`
  - `src/features/reviews/services/prFilesRepo.ts`

## 验证
- `pnpm db:migrate` 通过。
- `pnpm build` 通过。
