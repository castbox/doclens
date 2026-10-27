# Markdown 非法 URI 编码导致文档预览白屏修复

- 日期：2026-10-27
- 故障实例：`bj010-guru`，`http://119.147.205.10:6611`
- 故障文档：`docs/solutions/workflow-issues/tencent-mps-three-feature-config-diagnosis-2026-10-27.md`
- 启动入口：`~/Jobs/Code/ua-tools/ai-generation-flow/Justfile` 的 `just doclens`

## 根因

文档正文第 77 行包含行内代码 `` `tencent%` ``。该实例以项目根作为文档根，
`pathPrefix` 为空，行内代码会进入 Markdown 文档路径解析。

线上旧构建在 `resolveMarkdownDocPathCandidates()` 中直接执行
`decodeURIComponent("tencent%")`。孤立 `%` 不是合法 percent 编码，抛出
`URIError: URI malformed`，导致 React 预览树整体崩溃。

线上堆栈中的 `b -> code` 分别对应旧的路径解析函数和行内代码渲染组件。

## 修复

1. 新增 `safeDecodeURIComponent()` 公共纯函数，仅捕获 `URIError` 并保留原文本。
2. Markdown 链接、行内代码路径和锚点解析统一使用安全解码。
3. `DocPreview` 直接使用 `parseLocationAnchor()` 已解码的 heading，消除二次解码。
4. 下载文件名解析也改用安全解码，避免异常 `Content-Disposition` 引发同类崩溃。
5. 增加 `tencent%`、非法锚点、合法编码和共享工具函数回归测试。

## 验证

- `pnpm test:run`：26 个测试文件、208 个测试全部通过。
- `pnpm build`：Next.js 生产构建成功。
- 本地生产构建浏览器冒烟：
  - 目标文档正常渲染，包含正文标题和 `tencent%`。
  - 页面无 `pageerror`，无 `Application error`。
  - `#heading-100%25` 与非法 `#heading-100%` 均不再崩溃。
- 独立 `tsc --noEmit` 仍报告既有 `mermaidSvg.test.ts` 的 `DOMParser` 类型问题，
  该问题不影响本次 `pnpm build`，也不是本次改动引入。

## 风险与回滚

- 非法 URI 编码无法解码时会保留原文，因此无法定位到目标标题，但页面不会崩溃。
- 回滚方式：撤销本次提交并重新执行 `just doclens` 构建、启动。
