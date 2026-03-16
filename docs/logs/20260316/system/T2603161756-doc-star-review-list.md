# 任务简报：文档星标与审阅列表星标区

## 变更说明
- 为文档详情页工具栏新增星标开关，可直接加入或取消当前文档星标。
- 为右侧 PR 文件面板新增星标开关，支持在列表内快速标记重点 PR 文件。
- 为审阅列表页新增“星标文档”区域，集中展示最近星标的文件，并支持打开文档、带入文档路径筛选、取消星标。
- 新增 `starred_docs` SQLite 表与 `/api/docs/stars` 接口，统一承载文档星标状态。

## 影响文件
- `app/api/docs/stars/route.ts`
- `app/reviews/page.tsx`
- `db/migrate.ts`
- `db/schema.ts`
- `docs/prd/doclens_prd.md`
- `src/features/docs/domain/types.ts`
- `src/features/docs/services/docStarsRepo.ts`
- `src/features/docs/ui/DocPreview.tsx`
- `src/features/docs/ui/DocsWorkspace.tsx`
- `src/features/reviews/domain/types.ts`
- `src/features/reviews/services/prFilesRepo.ts`
- `src/features/reviews/ui/ReviewDrawer.tsx`
- `src/features/reviews/ui/StarredDocList.tsx`

## 行为说明
- 保持原有 PR 文件面板的类别筛选、已读状态筛选、点击打开与自动标记已读逻辑不变。
- 文档星标状态在文档详情页、PR 文件面板和审阅列表页之间保持同源同步。
- 星标能力仅作用于 docs 根目录内的文件路径，仍遵守现有只读与路径安全约束。

## 验证记录
- 构建校验：`pnpm build`
- 结果：通过

## 风险与说明
- 星标列表会在读取时自动清理已不存在的文档记录；如果后续引入大量星标，需要再评估批量校验性能。
- 本次未新增自动化测试，当前以构建校验和页面联动验证为主。
