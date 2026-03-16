# 任务简报：PR 文件面板幂等增量刷新

## 1. 变更摘要

- 将 `syncPrFilesSnapshot()` 从“全量扫描后逐条 upsert”改为“路径集合对账”。
- 刷新时仅对新增的 PR 文件路径执行 `stat / createdAt` 解析与写库，已有路径不再重复刷新元信息。
- 对已缺失的 PR 文件路径执行定向删除，保证快照最终一致。
- `ensurePrFileTracked()` 补充幂等保护：路径已存在时直接返回，避免打开已收录 PR 文件时重复刷新快照。

## 2. 行为保持说明

- 保持 PR 文件面板的刷新入口、筛选、已读、星标、打开文件等外部行为不变。
- 保持“新文件可补录、缺失文件可清理、已读/星标状态可保留”的既有语义不变。
- 本次优化只收敛服务端同步策略，不改动前端交互和接口路径。

## 3. 影响文件

- `src/features/reviews/services/prFilesRepo.ts`
- `src/features/reviews/services/prFilesRepo.test.ts`

## 4. 验证记录

- 执行 `pnpm vitest run src/features/reviews/services/prFilesRepo.test.ts`
- 结果：通过（6/6）
- 执行 `pnpm build`
- 结果：通过

## 5. 风险与后续

- 当前策略默认“同路径内容变更不主动重刷快照元信息”；如果后续业务需要感知同路径的 `createdAt/category/mtime` 变化，需要再引入显式的单文件强制重建入口。
