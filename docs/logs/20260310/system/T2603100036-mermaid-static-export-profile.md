# Mermaid 导出静态渲染配置修复

## 背景

Word 导出中的 Mermaid `flowchart` 出现“框线可见、节点文字不显示”。前一轮已经修复了 `sharp/libvips` 对 `<br>` 的 XML 解析报错，但这次问题不是崩溃，而是渲染保真度。

## 调研结论

1. Mermaid 官方配置文档说明，根级 `htmlLabels` 用于控制是否使用 HTML 标签渲染节点和边文字，并且优先级高于 `flowchart.htmlLabels`。
2. Mermaid Flowchart 官方文档说明，Markdown Strings 默认会自动换行；如需关闭可设置 `markdownAutoWrap: false`。
3. Mermaid 官方 issue #58 明确指出：生成的 SVG 会把文本放进 `foreignObject`/`div`，这类内容在浏览器外的 SVG 查看器中显示很差，`<br/>` 修正后文字仍可能不显示。

综合判断后，长期最优方案不是在导出链路常驻 Chromium，而是为“文档导出”建立独立的 Mermaid 静态渲染配置，优先产出标准 SVG 文本节点，再交给 `sharp` 光栅化。这样依赖更轻、冷启动更低，也更适合服务端批量导出。只有未来遇到 Mermaid 官方配置仍无法去掉 `foreignObject` 的图型时，再补浏览器渲染兜底。

参考资料：

- https://mermaid.js.org/config/setup/mermaid/interfaces/MermaidConfig.html
- https://mermaid.js.org/syntax/flowchart.html
- https://github.com/mermaid-js/mermaid/issues/58

## 实现

- 在 `src/features/docs/services/mermaidRenderService.ts` 中新增导出专用 `mermaidExportConfig`
  - `htmlLabels: false`
  - `markdownAutoWrap: false`
  - `flowchart.htmlLabels: false`
- 将 Mermaid 导出链路拆为两步：
  - `renderMermaidSvgForExport`：先产出静态 SVG
  - `renderMermaidPngDataUrl`：再将 SVG 转为 PNG data URL
- 保留 `<br>` -> `<br/>` 标准化，兼容其他图型的边缘情况
- 在 `src/features/docs/services/mermaidRenderService.test.ts` 增加回归测试，断言导出 SVG 不含 `foreignObject`

## 验证

- `pnpm test:run src/features/docs/services/mermaidRenderService.test.ts src/features/docs/domain/docExport.test.ts`
- `pnpm build`
- 真实样本复核：
  - 文件：`/Users/wangyongchang/Jobs/Code/adsynapse-smart-ads/docs/logs/20260309/sop/T2603092105-codex-cli-fullstack-sharing.md`
  - 共 6 个 Mermaid block
  - 首个 block 导出后 `foreignObject=false`
  - PNG data URL 正常生成

## 风险与后续

- 导出图的自动换行策略会比浏览器预览更保守，个别节点可能比页面预览更宽，但文字可见性和跨渲染器稳定性显著更高。
- 若后续发现某些 Mermaid 图型即使关闭 `htmlLabels` 仍强制输出 `foreignObject`，再对该图型单独补浏览器渲染 fallback。
