# 下拉时大纲可见性修复简报

- 时间：2026-02-07 03:56
- 目标：修复文档下拉后大纲不稳定显示的问题，确保滚动时大纲持续可见。

## 修改内容

### 1) 预览区滚动方式调整
- 文件：`src/features/docs/ui/DocsWorkspace.tsx`
- 改动：将预览容器 `Paper` 的 `overflow` 从 `auto` 调整为 `visible`。
- 作用：从“容器内部滚动”切换到“页面滚动”，减少 sticky 在嵌套滚动容器中的失效场景。

### 2) 大纲吸顶偏移优化
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 改动：
  - 大纲 sticky `top` 从 `8` 调整为 `76`（避开顶部 AppBar）
  - 提升 `zIndex`，并加 `height: fit-content`
- 作用：下拉时大纲仍固定在可视区右侧，不被顶部栏遮挡。

## 验证

- 执行：`pnpm build`
- 结果：通过（编译、类型检查、静态页生成均成功）
