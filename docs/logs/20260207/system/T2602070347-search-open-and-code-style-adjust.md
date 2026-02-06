# 搜索跳转与代码样式修复简报

- 时间：2026-02-07 03:47

## 1. 修复项

### 1.1 搜索页结果点击跳转详情
- 文件：`src/features/search/ui/SearchPageClient.tsx`
- 改动：点击搜索结果时改为直接跳转到 `/docs?path=...#L...`，不再经过 `/docs/view` 中转。
- 目的：保证搜索结果点击后能稳定打开文档详情并定位到命中行。

### 1.2 文档代码样式对齐
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 改动：
  - 代码文字颜色统一为 `#E96900`
  - `inline code` 背景改为浅灰 `#F8F8F8`
  - `inline code` 尺寸与间距对齐：`border-radius: 2px; margin: 0 2px; padding: 3px 5px; white-space: pre-wrap`
  - Markdown 代码块（`pre/code`）背景统一为 `#F8F8F8`
  - 代码行预览区背景统一为浅灰，字体保持橙色

## 2. 验证

- 执行：`pnpm build`
- 结果：通过（编译、类型检查、静态页面生成均成功）

## 3. 影响范围

- 仅涉及前端渲染与路由跳转行为
- 不涉及后端 API 与数据库结构变更
