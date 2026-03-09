# 任务简报：详情页导出 Word 文档

## 目标
- 在文档详情页“复制路径”按钮后新增导出能力，支持保存为 `.doc` 或 `.docx`。
- 先评估长期最优方案，再在当前代码结构内落地可扩展实现。

## 长期方案评估
- 长期最优方向是“统一导出模型 + 服务端生成”。
- 导出链路不应直接绑定浏览器 DOM，否则页面样式调整会导致导出结果漂移。
- `docx` 应作为主格式，使用服务端能力生成标准 Word 文档；`.doc` 保留兼容入口，但应尽量复用同一份导出内容模型。
- 对包含图片的 Markdown 文档，若希望兼容更多 Word 版本，服务端需要补齐 SVG 转换能力，因此本次同时补入 `sharp`。

## 本次实现
- 新增 `GET /api/docs/export?path=...&format=doc|docx`。
- 新增导出 domain/service：
  - `src/features/docs/domain/docExport.ts`
  - `src/features/docs/services/docExportService.ts`
- Markdown 导出使用统一的服务端渲染链路：
  - `remark-parse` + `remark-gfm` + `remark-rehype` + `rehype-sanitize` + `rehype-stringify`
  - 复用现有 `autoLinkDocsMarkdownPaths`、`preserveDiffSectionLineBreaks`
- `.docx` 使用 `@turbodocx/html-to-docx` 生成，`.doc` 使用同一份 HTML 模板导出兼容格式。
- `DocPreview` 工具栏在“复制路径”后新增“保存为 Word 文档”按钮，并提供 `.docx` / `.doc` 两个菜单项。
- 下载过程复用现有 Snackbar 反馈成功/失败状态。

## 影响文件
- `app/api/docs/export/route.ts`
- `src/features/docs/domain/docExport.ts`
- `src/features/docs/domain/docExport.test.ts`
- `src/features/docs/services/docExportService.ts`
- `src/features/docs/ui/DocPreview.tsx`
- `package.json`
- `pnpm-lock.yaml`

## 验证
- `pnpm test:run src/features/docs/domain/docExport.test.ts`
- `pnpm build`

## 风险与后续建议
- 当前导出内容以“详情页语义内容”与统一模板为准，不是浏览器像素级还原；这是有意选择，利于长期维护。
- 复杂 Markdown（尤其是自定义 HTML、非常规嵌套样式）在 Word 中可能与网页渲染存在轻微差异。
- 如果后续需要更高保真度，建议把导出模型继续细化为标题、段落、列表、表格、代码块等结构化 block，再逐步替换底层转换器。
