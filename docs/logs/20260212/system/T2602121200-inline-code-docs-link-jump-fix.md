# Markdown 行内代码 docs 路径点击跳转修复简报

## 1. 问题
- 在 PR 详情 Markdown 中，`docs/logs/...md` 写在反引号（行内代码）里时无法点击跳转。
- 例如：`docs/logs/20260212/asset-library/T2602121120-asset-library-google-youtube-sync-log-check.md`

## 2. 根因
- 现有自动补链逻辑只处理普通文本，不处理代码块/行内代码。
- `DocPreview` 的 `code` 渲染分支会将行内代码统一渲染为 `<code>`，不会执行内部文档跳转逻辑。

## 3. 修复内容
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 新增内部链接点击处理函数 `handleInternalDocLinkClick`，统一处理：
  - 详情页内导航
  - 同文档锚点跳转
- 保持原有 `a` 标签内部文档跳转逻辑，但改为复用该函数。
- 在 `components.code` 的行内代码分支新增判定：
  - 当值为 `docs/...md`（可带 `#anchor`）时，渲染为可点击链接样式并跳详情页。
  - 非 `docs/...md` 行内代码保持原样显示，不受影响。

## 4. 行为保持说明
- 代码块（fenced code block）仍不做自动跳转处理。
- 非 docs 路径、非 markdown 路径的行内代码（如 `backend/...go`）保持不可点击。
- 现有普通 Markdown 链接与自动补链逻辑保持不变。

## 5. 验证记录
- 单测：
  - 命令：`pnpm test:run src/features/docs/domain/markdownPreviewTransform.test.ts`
  - 结果：`9 passed (9)`
- 构建：
  - 命令：`pnpm build`
  - 结果：构建成功（Next.js 14.2.35）

## 6. 风险与回滚
- 风险：行内代码中如果写入 `docs/...md`，现在会呈现“可点击代码样式”；属预期增强。
- 回滚：恢复 `src/features/docs/ui/DocPreview.tsx` 本次改动并重新执行 `pnpm build`。
