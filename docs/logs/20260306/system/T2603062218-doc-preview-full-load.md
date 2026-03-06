# 文档预览支持按需显示完整页面数据

## 1. 目标
- 保持大文件默认截断预览策略不变。
- 在用户需要时，支持从预览区直接加载并显示完整页面数据。

## 2. 主要改动

### 2.1 API 与服务层
- `app/api/docs/file/route.ts`
  - 新增 `full=1` 查询参数透传。
- `src/features/docs/services/docsFsService.ts`
  - `readFilePreview` 新增 `fullContent` 选项。
  - 默认仍按 `DOCLENS_MAX_FILE_PREVIEW_BYTES` / `DOCLENS_MAX_FILE_PREVIEW_LINES` 截断。
  - 当 `fullContent=true` 时返回完整文本，不再截断。

### 2.2 预览区交互
- `src/features/docs/ui/DocPreview.tsx`
  - 维持默认预览请求。
  - 当返回 `truncated=true` 时，在告警中提供“显示完整页面数据”按钮。
  - 点击后以 `full=1` 重新请求，并区分缓存“预览态 / 全量态”。

### 2.3 回归测试
- `src/features/docs/services/docsFsService.test.ts`
  - 覆盖默认截断。
  - 覆盖按需全量读取。

## 3. 验证记录
- 单测：
  - `pnpm test:run` ✅（34/34 通过）
- 构建：
  - `pnpm build` ✅

## 4. 风险与说明
- 当前构建过程中仍会输出一个已有环境告警：
  - `better-sqlite3` 与当前 Node ABI 不匹配，导致 `api/reviews/pr-files` 相关同步步骤报错。
  - 该问题未导致本次 `next build` 失败，且与本次文档预览改动无直接耦合。

## 5. 回滚方式
- 回滚以下文件即可撤销本次能力：
  - `app/api/docs/file/route.ts`
  - `src/features/docs/services/docsFsService.ts`
  - `src/features/docs/ui/DocPreview.tsx`
  - `src/features/docs/services/docsFsService.test.ts`
