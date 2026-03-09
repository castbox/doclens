# 任务简报：修复 Word 导出中的 Mermaid 图表显示

## 问题
- 详情页预览中的 Mermaid 图表可以正常显示，但导出的 `.doc` / `.docx` 中 Mermaid 区块只有源码，没有图表。

## 原因
- 页面预览使用 `MermaidCodeBlock` 在浏览器端实时渲染 SVG。
- 导出链路在服务端仅把 Markdown 转成普通 HTML，Mermaid 代码块没有进入渲染流程，因此导出时丢失图形结果。

## 本次修复
- 新增服务端 Mermaid 渲染服务：
  - `src/features/docs/services/mermaidRenderService.ts`
- 在导出 Markdown 的 rehype 链路中识别 Mermaid 代码块，并替换为 PNG data URL 图片：
  - `src/features/docs/services/docExportService.ts`
- 补充导出模板中的图片样式，保证 Mermaid 图在 Word 文档中可见：
  - `src/features/docs/domain/docExport.ts`
- 新增 Mermaid 导出测试：
  - `src/features/docs/services/mermaidRenderService.test.ts`
- 为服务端渲染补充依赖：
  - `jsdom`
  - `dompurify`
  - `unist-util-visit`
  - `@types/jsdom`

## 设计说明
- 采用“服务端 Mermaid -> SVG -> PNG data URL -> 嵌入导出 HTML”的方式。
- 这样无需引入浏览器自动化，也不改变现有详情页预览逻辑。
- PNG 比直接嵌入 SVG 更适合 Word 导出，兼容性更稳。

## 验证
- `pnpm test:run src/features/docs/services/mermaidRenderService.test.ts src/features/docs/domain/docExport.test.ts`
- `pnpm build`

## 风险与后续建议
- 当前服务端为 Mermaid 提供了 `jsdom` + `SVGElement` 尺寸 polyfill，复杂图表的排版精度可能与浏览器端存在轻微差异。
- 若后续需要更高保真度，可考虑把 Mermaid 导出收敛到独立渲染 worker，或引入专用的离屏渲染方案。
