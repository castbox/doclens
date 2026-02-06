# 任务简报：审阅面板改为 PR 文件驱动 + 左侧目录抽屉化

## 1. 需求背景
- 删除“创建审阅单”功能。
- 右侧审阅面板改为从 `docs/pr` 文件加载，按文件创建时间降序。
- 支持按目录（年月日）筛选与关键词搜索。
- 数据库记录文件已读状态，并与目录保持实时同步。
- 左侧 docs 目录改为抽屉，可收起/展开，展示完整层级且不再固定高度。

## 2. 主要改动
- 新增 `pr_review_files` 表（SQLite）：记录 `path/name/date_folder/created_at/modified_at/is_read/read_at/last_seen_at`。
- 新增服务：
  - `src/features/reviews/services/prFilesRepo.ts`
  - `src/features/reviews/services/prFilesSyncService.ts`
- 新增 API：
  - `GET /api/reviews/pr-files`（列表 + 日期目录）
  - `PATCH /api/reviews/pr-files/read`（标记已读）
- 下线创建能力：
  - 移除 `POST /api/reviews`
  - 删除 `app/api/reviews/[id]/items/route.ts`（不再支持新增问题项）
- 右侧面板重构为 PR 文件面板：
  - 文件列表、已读状态、日期目录筛选、关键词搜索
  - 点击文件打开预览
- 中间预览联动：
  - `DocPreview` 增加 `onLoaded` 回调
  - 打开 `pr/` 文件后自动标记已读
- 左侧目录改造：
  - 改为 MUI Drawer，可收起/展开
  - 首次递归加载完整目录并默认展开
  - 取消固定高度与固定滚动容器
- 文档同步：更新 `docs/prd/doclens_prd.md` 对应需求描述（从创建审阅单切换为 PR 文件面板 + 已读同步）。

## 3. 路径安全与只读约束
- 文件访问继续通过 `resolveDocsPath` 做 normalize + root 校验。
- `PATCH /api/reviews/pr-files/read` 强制限制 `path` 必须位于 `pr/`。
- 对 docs 文件仅做读取与元信息同步，不提供写入 docs 能力。

## 4. 验证记录
- 构建校验：`pnpm build`
- 结果：通过（Next.js 14.2.35，全部页面与 API 路由构建成功）

## 5. 风险与后续建议
- 目录全量递归加载在超大 docs 树场景可能增加初始请求量；若后续规模继续增长，可改为“按需加载 + 一键展开全部”。
- 文件创建时间依赖文件系统 `birthtime`，在部分环境可能退化为 `mtime`（已做回退策略）。
- 单元测试：`pnpm test:run` 通过（3 个测试文件，8 个测试用例）。
