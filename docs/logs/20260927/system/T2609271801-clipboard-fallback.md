# 任务简报：修复复制路径时 clipboard 未定义

## 问题
- 文档详情页点击「复制路径」抛出未捕获运行时错误：
  - `TypeError: Cannot read properties of undefined (reading 'writeText')`
  - 位置：`src/features/docs/ui/DocPreview.tsx` 直接调用 `navigator.clipboard.writeText`

## 原因
- Clipboard API 只在安全上下文可用（`https` 或 `localhost`）。
- 通过局域网 IP 的 `http` 页面访问时，`navigator.clipboard` 为 `undefined`。
- 复制路径的点击处理没有 `try/catch`，异常直接变成页面 Unhandled Runtime Error。

## 本次修复
- 新增 `src/shared/utils/clipboard.ts`：
  - 安全上下文优先使用 `navigator.clipboard.writeText`。
  - `clipboard` 不存在或 `writeText` 被拒绝时，在同一次点击里同步回退到 `document.execCommand("copy")`。
  - 两种方式都不可用时抛出错误，由调用方展示提示，不再把页面打崩。
- `DocPreview` 的「复制路径」和「复制 Markdown 源文件」都改为走该工具。
- 未截断的 Markdown 直接复制已加载源文，避免先发请求丢掉用户手势；截断文件仍请求 `raw=1` 后再复制完整源文件。
- 新增回归测试：`src/shared/utils/clipboard.test.ts`。

## 验证
- `corepack pnpm@8.15.4 exec vitest run`：14 files / 73 tests 通过。
- `corepack pnpm@8.15.4 build`：通过（Next.js 14.2.35，编译、类型检查、17 个静态页生成成功）。

## 风险与回滚
- `document.execCommand("copy")` 已废弃，但目前仍是非安全上下文里唯一可用的复制方式。
- 截断后的 Markdown 需要先请求全文；若浏览器在异步请求后不再允许 `execCommand`，会显示「复制 Markdown 源文件失败」，不会再抛未捕获异常。
- 回滚本次新增的 clipboard 工具，并把 `DocPreview` 的两处复制调用恢复为 `navigator.clipboard.writeText` 即可。
