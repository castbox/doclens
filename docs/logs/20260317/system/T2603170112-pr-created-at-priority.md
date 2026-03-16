# 任务简报: PR 文档创建时间优先级优化

## 背景
- `docs/pr/.../*.md` 当前的 `createdAt` 仍然直接取文件系统 `birthtime/mtime`。
- 这会导致 PR 文件列表中的“创建时间”不稳定，也无法准确反映文档真正的业务创建时间。

## 目标
- 对 `docs/pr/.../*.md` 的创建时间采用统一优先级：
  1. frontmatter `created_at`
  2. Git 首次提交时间
  3. 文件名日期
  4. 文件系统时间兜底

## 本次改动
- 新增 `src/features/reviews/services/prFileCreatedAt.ts`
  - 封装 PR 文档创建时间解析链。
  - frontmatter 只探测文件头部，优先读取 `created_at`，避免全量读文件。
  - Git 时间采用“按 HEAD 构建批量索引 + 缺失路径再 `--follow` 补查”的方案，避免 1839 个文件逐个执行 `git log`。
  - 文件名日期支持 `YYYYMMDD-*` 与 `YYYY-MM-DD-*` 前缀格式。
- 更新 `src/features/reviews/services/prFilesRepo.ts`
  - `readPrFileSnapshot()` 与批量 `walkPrFiles()` 改为统一调用 `resolvePrFileCreatedAt()`。
  - 后续 watcher 同步、首次快照和单文件补录都会使用同一套创建时间策略。
- 更新 `src/features/reviews/services/prFilesRepo.test.ts`
  - 新增 frontmatter 优先、Git 优先、文件名日期回退的回归测试。
- 更新 `src/features/docs/services/docStatesRepo.ts`
  - 增加测试重置辅助函数，便于隔离 SQLite 回归测试。

## 方案说明
- 这是当前规模下更优的长期方案：
  - frontmatter 探测做成头部读取缓存，避免全量读取所有 Markdown。
  - Git 时间优先使用单次批量日志建立索引，只有批量索引缺失时才单文件 `--follow`。
  - 这样既满足“Git 首次提交时间优先”的规则，也避免在 1839 个文件上逐个起 Git 进程。

## 验证
- `pnpm test:run src/features/reviews/services/prFilesRepo.test.ts src/features/docs/services/docsFsService.test.ts`
- `pnpm build`

## 验证结果
- 测试通过。
- 构建通过。

## 后续建议
- 如果后面需要把 frontmatter 中更多业务字段纳入 PR 列表排序或筛选，建议继续沿用 `prFileCreatedAt.ts` 这种“批量索引 + 小成本补查”的模式，避免在 `prFilesRepo.ts` 里继续堆逻辑。
