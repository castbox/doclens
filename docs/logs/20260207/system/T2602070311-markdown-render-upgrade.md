# 任务简报：Markdown 渲染升级 + 复制源文件

## 1. 目标
- 修复 Markdown 代码块“颜色区分不明显”的问题。
- 升级前端 Markdown 渲染体验。
- 支持一键复制 Markdown 源文件内容。

## 2. 实现内容
- 引入代码高亮依赖：`react-syntax-highlighter`（Prism）。
- 在 `src/features/docs/ui/DocPreview.tsx` 中增强 Markdown 渲染：
  - 代码块语法高亮（按语言）。
  - 显示行号。
  - 偶数行轻量底色，增强行区分。
  - 行内代码单独样式。
  - blockquote/table 样式增强。
- 增加“复制 Markdown 源文件”按钮（仅 Markdown 文件显示）：
  - 从 `/api/docs/file?path=...&raw=1` 拉取源文并复制到剪贴板。
  - 使用 Snackbar 展示成功/失败反馈。
- 增加类型依赖：`@types/react-syntax-highlighter`。

## 3. 影响文件
- `src/features/docs/ui/DocPreview.tsx`
- `package.json`
- `pnpm-lock.yaml`

## 4. 验证
- 构建校验：`pnpm build` 通过。

## 5. 备注
- 该改动不影响 docs 只读策略与路径安全校验逻辑。
