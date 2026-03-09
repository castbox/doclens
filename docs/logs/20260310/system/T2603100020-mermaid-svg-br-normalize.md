# 任务简报：修复 Mermaid 导出时的 SVG XML 非法问题

## 问题
- 导出 `.doc` / `.docx` 时，部分 Mermaid 图表渲染失败。
- 服务端日志报错：
  - `Input buffer has corrupt header`
  - `Opening and ending tag mismatch: g line 1 and svg`

## 根因
- Mermaid 在部分 `flowchart` 图中会把标签里的换行输出成 `foreignObject` 内的 `<br>`。
- 浏览器可以容忍这种 HTML 写法，但 `sharp/libvips` 按 XML 解析 SVG 时要求自闭合标签，因此把整段 SVG 判为非法。
- 该问题在包含 `<br/>` 标签文本的 Mermaid 节点中稳定复现。

## 本次修复
- 文件：`src/features/docs/services/mermaidRenderService.ts`
- 在将 Mermaid SVG 交给 `sharp` 前，增加标准化步骤：
  - 将 SVG 中的 `<br>` 统一改为 `<br/>`
- 保持其他 Mermaid 导出链路不变，不影响页面预览逻辑。

## 测试补充
- 文件：`src/features/docs/services/mermaidRenderService.test.ts`
- 新增带 HTML 换行标签的 Mermaid 用例：
  - `flowchart LR`
  - 节点文案中包含 `<br/>`

## 验证
- `pnpm test:run src/features/docs/services/mermaidRenderService.test.ts src/features/docs/domain/docExport.test.ts`
- `pnpm build`

## 结论
- 导出服务现在可以正确处理带 `<br/>` 文案的 Mermaid 图。
- 用户日志中那组 6 张 `flowchart` Mermaid 图表对应问题已被覆盖。
