# 文档大纲默认收起简报

## 1. 变更目标
- 将文档详情页右侧大纲的默认状态调整为“收起”。

## 2. 改动内容
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 将 `outlineCollapsed` 初始值由 `false` 改为 `true`。
- 结果：首次进入 Markdown 详情页时，大纲默认不展开；用户可通过顶部工具栏按钮手动展开。

## 3. 行为影响
- 仅影响初始展示状态。
- 大纲展开/收起按钮位置、交互逻辑与点击跳转行为均保持不变。

## 4. 验证记录
### 4.1 单测
- 命令：`pnpm test:run`
- 结果：通过（6 files, 25 tests）

### 4.2 构建
- 命令：`pnpm build`
- 结果：通过（Next.js 14.2.35，编译/类型检查/静态页面生成成功）

## 5. 回滚方案
- 将 `outlineCollapsed` 初始值恢复为 `false`，重新执行 `pnpm build` 验证。
