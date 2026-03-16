# 任务简报：PR 文件面板性能优化

## 变更概述

- 将右侧 PR 文件面板从“整表 DOM 渲染”改为基于 `@tanstack/react-virtual` 的虚拟滚动，只渲染可视区附近项。
- 去掉 PR 文件面板对星标状态变化的整表重拉，改为由父层下发单条星标补丁，在抽屉内本地更新对应记录。
- 调整 PR 文件快照同步策略：
  - 列表接口改为依赖 watcher + 首次就绪检查，不再每次请求都强制全量扫盘。
  - 已读接口改为只补齐当前文件的快照，不再每次标记已读都先做整仓同步。
- `listPrFiles` 的类别/已读过滤下推到 SQLite 查询，避免先全量查出再在 Node 侧过滤。

## 影响文件

- `src/features/reviews/ui/ReviewDrawer.tsx`
- `src/features/docs/ui/DocsWorkspace.tsx`
- `src/features/docs/ui/DocPreview.tsx`
- `src/features/reviews/domain/types.ts`
- `src/features/reviews/services/prFilesRepo.ts`
- `src/features/reviews/services/prFilesSyncService.ts`
- `app/api/reviews/pr-files/route.ts`
- `app/api/reviews/pr-files/read/route.ts`
- `package.json`
- `pnpm-lock.yaml`

## 关键收益

- 1839 条 PR 文件不再一次性生成 1839 个 Drawer 卡片节点，Tab 切换和筛选切换的主线程压力显著下降。
- 打开 PR 文件自动标记已读时，不再触发右侧面板整表刷新；抽屉本地已读状态会立即更新。
- 从文档详情页、左侧星标文档列表、右侧 PR 面板任一入口变更 PR 文件星标时，右侧面板只更新对应条目，不再整表重拉。
- 请求链路中最重的 `syncPrFilesSnapshot()` 从“高频每次调用”收敛到“首次/退化场景按需调用”。

## 验证记录

- 数据量核对：`pr_review_files` 当前共 `1839` 条，`pr/` 范围星标 `4` 条。
- 基线测量（真实 docs 根目录）：
  - `syncPrFilesSnapshot()` 约 `221ms`
  - `listPrFiles()` 全量查询约 `6.9ms`
- 优化后热路径测量：
  - `ensurePrFilesSnapshotReady()` 已有快照场景约 `0.004ms`
  - `listPrFiles()` 全量查询约 `7.7ms`
- 构建校验：`pnpm build`
- 结果：通过

## 风险与后续建议

- 当前虚拟列表仍然一次性返回全量 JSON；若后续 PR 文件规模继续增长到数万级，下一阶段应补充服务端游标分页或按日期分组懒加载。
- `@tanstack/react-virtual` 增加了少量前端依赖体积，但相对 1800+ 条列表渲染收益更高，当前是合理交换。
