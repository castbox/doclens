# 任务简报：PR 面板与文档详情页星标、审阅列表星标列表

## 变更目标

- 在 `/docs` 文档详情页增加文档星标切换能力。
- 在右侧 PR 文件面板增加星标切换能力，并与详情页保持同一份状态。
- 在 `/reviews` 审阅列表页增加星标文档列表，支持快速带入筛选、打开文档、取消星标。

## 主要实现

- 新增 `starred_docs` SQLite 表及 API：
  - `app/api/docs/stars/route.ts`
  - `src/features/docs/services/docStarsRepo.ts`
  - `db/schema.ts`
  - `db/migrate.ts`
- 文档详情页工具栏新增星标按钮：
  - `src/features/docs/ui/DocPreview.tsx`
  - `src/features/docs/ui/DocsWorkspace.tsx`
- PR 文件面板列表项新增星标按钮，并将 PR 文件返回模型补充 `isStarred/starredAt`：
  - `src/features/reviews/ui/ReviewDrawer.tsx`
  - `src/features/reviews/services/prFilesRepo.ts`
  - `src/features/reviews/domain/types.ts`
- 审阅列表页新增星标文档列表组件：
  - `app/reviews/page.tsx`
  - `src/features/reviews/ui/StarredDocList.tsx`
- 新增 docs 域星标类型：
  - `src/features/docs/domain/types.ts`

## 行为说明

- 星标以“文档相对路径”作为唯一键，全局共享，不区分用户。
- 在 PR 面板或文档详情页切换星标后，同页内会同步刷新另一处展示。
- 审阅列表页的星标列表会读取同一份数据，并支持：
  - 带入文档路径筛选
  - 打开文档详情
  - 直接取消星标
- docs 访问仍走既有路径安全校验，未引入写 docs 文件能力，仍保持只读约束。

## 验证记录

- 构建校验：
  - 命令：`pnpm build`
  - 结果：通过
- 说明：
  - 首次构建在 Next 导出阶段命中旧 `.next` 产物缓存缺失 `next-font-manifest.json`。
  - 将旧构建目录重命名后重新执行 `pnpm build`，构建成功。

## 风险与后续

- 星标当前为全局共享状态，不区分用户；若后续引入账号体系，需要补用户维度。
- `starred_docs` 会在读取时清理已不存在的文件路径；若未来有大批量星标，需要考虑批量清理成本。
