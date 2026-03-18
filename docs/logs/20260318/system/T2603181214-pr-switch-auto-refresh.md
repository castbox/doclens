# 任务简报：切换 PR 后自动刷新最新 PR 文件

## 1. 变更摘要

- 明确“切换 PR”的前端语义：当当前选中文档路径从一个值切换到另一个 `pr/...` 路径时，触发一次静默强制同步。
- 右侧 PR 文件面板继续保留已有的缓存复用与定时刷新；但在“PR 切换”这一特定场景下，会额外请求 `GET /api/reviews/pr-files?refresh=1`，确保面板拿到最新快照。
- 补充收起抽屉场景：若用户在面板关闭时切换到了新的 PR，待下次展开面板时会补做这次最新同步。

## 2. 行为保持说明

- 不改变类别筛选、已读筛选、已读标记、星标开关、手动刷新、60 秒后台轮询这些既有行为。
- 不再依赖组件重挂载去“碰巧刷新”；刷新触发条件改为显式的路径切换规则，避免语义漂移。
- 服务端仍复用现有 `refresh=1` 的幂等增量同步逻辑，不新增接口路径。

## 3. 影响文件

- `src/features/reviews/ui/ReviewDrawer.tsx`
- `src/features/reviews/domain/prFilesCache.ts`
- `src/features/reviews/domain/prFilesCache.test.ts`

## 4. 验证记录

- 执行 `pnpm test:run src/features/reviews/domain/prFilesCache.test.ts`
- 结果：通过（6/6）
- 执行 `pnpm build`
- 结果：通过

## 5. 风险与后续

- 当前“PR 切换”仍以“选中文档路径变化”为准；如果后续产品层面引入更明确的 PR 实体（例如 PR 编号、分组、批次），建议再把刷新触发从“路径”升级为“PR 实体键”。
