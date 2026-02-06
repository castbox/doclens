# Markdown 行号锚点跳转修复简报

- 时间：2026-02-07 04:17
- 问题：`/docs?...#Lxxx` 在 Markdown 文档中无法按行号跳转。

## 原因

- 现有实现中，`#Lxxx` 仅对 code/text 预览生效；
- Markdown 预览只处理了标题锚点（`#heading-...`），未处理行号锚点。

## 修改内容

### 1) 补充标题行号元数据
- 文件：`src/features/docs/domain/markdownHeading.ts`
- 改动：`MarkdownHeading` 增加 `line` 字段（标题所在源行号）。

### 2) Markdown 预览增加 `#Lxxx` 跳转策略
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 改动：
  1. 当 `location.line` 存在时，先尝试精确 `#line-{N}`（兼容已有场景）
  2. 若无精确行锚，回退到“最近且不超过该行号”的 Markdown 标题位置
  3. 若仍无可定位点，回退到 Markdown 文档顶部
- 同时给 Markdown 容器增加 `id="markdown-preview-root"` 作为兜底定位点。

## 结果

- 对于 Markdown 文档，`#L4` 这类行号锚点不再“无响应”，会跳转到更接近目标行的位置。

## 验证

- 执行：`pnpm build`
- 结果：通过（编译、类型检查、静态页生成均成功）
