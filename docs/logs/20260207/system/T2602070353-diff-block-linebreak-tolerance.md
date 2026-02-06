# Diff 区块换行容错修复简报

- 时间：2026-02-07 03:53
- 目标：修复文档中“关键 Diff（自检）”与“Diff (spike/fullstack...HEAD)”区块渲染时不按行换行的问题。

## 修改内容

- 文件：`src/features/docs/ui/DocPreview.tsx`
- 新增容错预处理：
  1. 识别以下标题行（含中英文括号、带/不带 `#` 标题语法）：
     - `关键 Diff（自检）`
     - `Diff (spike/fullstack...HEAD)`
  2. 在识别区块内，对普通文本行自动补 Markdown 硬换行（行尾两个空格）
  3. 对代码块、列表、引用、表格行保持原样，不做破坏性改写
- 应用链路：
  - 渲染前执行 `preserveDiffSectionLineBreaks`，再执行自动 docs 链接识别

## 结果

- 该区块内容会按源文本逐行显示，不再挤成单段落。

## 验证

- 执行：`pnpm build`
- 结果：通过（编译、类型检查、静态页生成均成功）
