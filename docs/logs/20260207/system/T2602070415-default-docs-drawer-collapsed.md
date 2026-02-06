# 默认 Docs 目录收起简报

- 时间：2026-02-07 04:15
- 目标：`/docs` 页面默认收起左侧目录抽屉。

## 修改内容

- 文件：`src/features/docs/ui/DocsWorkspace.tsx`
- 改动：将 `docsDrawerOpen` 初始值从 `true` 调整为 `false`。

## 结果

- 进入 `/docs` 时左侧目录默认收起。
- 用户仍可通过顶部“展开目录”按钮手动打开。

## 验证

- 执行：`pnpm build`
- 结果：通过（编译、类型检查、静态页生成均成功）
