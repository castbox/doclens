# Markdown 链接非法 URI 解码崩溃修复简报

## 问题

- `/docs` 预览 Markdown 时出现运行时错误：`URIError: URI malformed`。
- 报错点在 `src/features/docs/domain/markdownPreviewTransform.ts`，`resolveMarkdownDocPathCandidates()` 对任意 `href` 直接调用 `decodeURIComponent(href)`。

## 根因

- Markdown 文档中的链接或行内 docs 路径可能包含未编码的 `%`。
- `decodeURIComponent()` 遇到非法 percent escape 会直接抛出 `URIError`。
- 该异常发生在 React Markdown 链接渲染路径中，导致整个页面预览崩溃。

## 修复

- 新增 `safelyDecodeURIComponent()`：
  - 合法编码继续按 `decodeURIComponent()` 解码。
  - 非法 percent 编码按原始字符串继续解析。
  - 非 `URIError` 异常继续抛出。
- `resolveMarkdownDocPathCandidates()` 改为使用安全解码。
- `buildAnchorHash()` 同步使用安全解码，避免 hash 中裸 `%` 触发同类崩溃。

## 回归覆盖

- `src/features/docs/domain/markdownPreviewTransform.test.ts`
  - 覆盖路径中裸 `%`：`docs/pr/进度100%.md`
  - 覆盖 query 中裸 `%`：`docs/pr/plan.md?note=100%`
  - 保留合法编码解码：`%E8%8C%83%E5%9B%B4.md`
  - 覆盖 hash 中裸 `%`：`#进度100%`

## 验证

- `pnpm test:run src/features/docs/domain/markdownPreviewTransform.test.ts`
  - 结果：通过，`14 passed`
- `pnpm build`
  - 结果：通过
  - 关键输出：`Compiled successfully`，静态页面生成 `17/17`

## 风险与回滚

- 行为变化仅限 Markdown 内部链接解析遇到非法 URI 编码时不再崩溃。
- 非法编码保留原始字符串解析，可能无法得到用户预期的解码结果，但比页面崩溃更稳妥。
- 如需回滚，恢复 `markdownPreviewTransform.ts` 和对应测试后重新执行目标测试与 `pnpm build`。
