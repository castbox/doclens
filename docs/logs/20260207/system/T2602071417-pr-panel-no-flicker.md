# 任务简报：PR 文件面板筛选闪动优化

## 问题
- PR 文件面板每次切换筛选都会发请求并显示 loading，导致列表闪动。

## 优化方案
- 改为“首次拉全量数据 + 前端本地筛选”：
  - 首次加载请求 `/api/reviews/pr-files` 全量数据。
  - 类别/已读筛选在前端 `useMemo` 本地过滤，不再触发网络请求。
- 保留刷新能力：
  - `refreshToken` 变化时执行“静默刷新”，不清空当前列表。
  - 增加轻量提示“正在后台刷新...”，避免页面跳闪。

## 影响文件
- `src/features/reviews/ui/ReviewDrawer.tsx`

## 验证
- `pnpm build` 通过。
- `pnpm test:run` 通过（3 files / 8 tests）。
