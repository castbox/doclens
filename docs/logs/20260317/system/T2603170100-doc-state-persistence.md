# 任务简报: 文档状态统一数据库持久化

## 背景
- 用户要求将“已读/未读”和“星标”统一放入数据库持久化，避免状态因 watcher、快照重建或进程重启而丢失。
- 现状中：
  - Docs 星标使用 `starred_docs` 单独存储。
  - PR 已读/未读直接写在 `pr_review_files` 快照表内。
  - PR 星标依赖 `pr_review_files` 与 `starred_docs` 跨表拼装。
- 这会导致“文件快照”和“用户状态”耦合，长期存在状态丢失和同步割裂风险。

## 方案
- 新增统一状态表 `doc_states`，按 `path` 保存：
  - `is_starred`
  - `starred_at`
  - `is_read`
  - `read_at`
  - `updated_at`
- `doc_states` 成为文档状态 SSOT。
- `pr_review_files` 退回为纯快照表，只负责 PR 文件存在性和元信息。
- Docs 星标接口、PR 已读接口、PR 列表状态拼装全部改为围绕 `doc_states` 读写。

## 本次改动
- `db/schema.ts`
  - 新增 `doc_states` 表结构定义。
- `db/migrate.ts`
  - 新增 `doc_states` 建表和索引。
  - 增加从 `starred_docs`、`pr_review_files` 向 `doc_states` 的兼容 backfill。
- `src/features/docs/services/docStatesRepo.ts`
  - 新增统一状态仓储。
  - 负责建表、兼容 backfill、按路径读写状态。
- `src/features/docs/services/docStarsRepo.ts`
  - 改为 `docStatesRepo` 的轻量包装层。
- `src/features/reviews/services/prFilesRepo.ts`
  - PR 列表改为 `pr_review_files LEFT JOIN doc_states`。
  - 已读筛选直接基于 `doc_states.is_read`。
  - `markPrFileRead()` 改为写 `doc_states`，不再把状态绑在 PR 快照表上。
- `db/client.ts`
  - 增加测试用 DB client reset，支持隔离 SQLite 回归测试。

## 行为结果
- 星标和已读状态即使在 PR 快照被删除后，也会继续保留在 `doc_states`。
- PR 文件重新被 watcher 或同步流程收录后，会自动带回之前的已读和星标状态。
- Docs 星标列表和 PR 文件面板都从统一数据库状态源读取，不再依赖分散表拼装。

## 验证
- `pnpm test:run src/features/reviews/services/prFilesRepo.test.ts src/features/docs/services/docsFsService.test.ts`
- `pnpm build`

## 新增回归覆盖
- `src/features/reviews/services/prFilesRepo.test.ts`
  - 覆盖“PR 文件被删除导致快照清理后，重新同步仍能恢复已读和星标状态”。

## 风险与后续建议
- 旧表 `starred_docs` 与 `pr_review_files.is_read/read_at` 目前保留为兼容迁移来源，后续可以在稳定后逐步下线。
- 如果后面要进一步扩展“最近访问”“置顶”“收藏分组”等状态，建议继续沿用 `doc_states` 统一扩展，避免再次分散存储。
