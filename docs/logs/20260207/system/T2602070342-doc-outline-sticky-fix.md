# 文档大纲吸顶修复简报

- 时间：2026-02-07 03:42
- 目标：修复 `/docs` 页面中“文档大纲下滑后不固定在顶部”的问题。

## 1. 修改内容

### 1.1 调整预览滚动容器定位
- 文件：`src/features/docs/ui/DocsWorkspace.tsx`
- 改动：为文档预览容器 `Paper` 增加 `position: relative`，确保子元素 `sticky` 计算参照稳定。

### 1.2 调整大纲 sticky 生效断点与偏移
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 改动：
  1. Markdown 布局从 `xs/ lg` 改为 `xs/ md` 双列切换（`md` 起展示右侧大纲列）
  2. 大纲容器 `position` 从 `lg: sticky` 调整为 `md: sticky`
  3. `top` 改为 `md: 8`，与预览滚动容器对齐
  4. 增加 `zIndex: 1`，避免滚动内容覆盖

## 2. 结果

- 文档滚动时，大纲可在右侧保持吸顶，不再随正文整体滑走。

## 3. 验证

- 构建命令：`pnpm build`
- 结果：通过（编译、类型检查、静态页生成均成功）
