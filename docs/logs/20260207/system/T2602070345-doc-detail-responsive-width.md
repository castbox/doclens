# 文档详情自适应宽度修复简报

- 时间：2026-02-07 03:45
- 目标：解决 `/docs` 文档详情区域在不同屏宽和抽屉开关状态下未自适应的问题。

## 1. 修改内容

### 1.1 工作台右侧留白改为动态
- 文件：`src/features/docs/ui/DocsWorkspace.tsx`
- 改动：
  1. 新增 `reviewDrawerOpen` 状态并由父组件统一管理
  2. 仅在右侧 PR 抽屉打开时预留 `lg` 右边距，关闭后立即释放宽度
  3. 向 `ReviewDrawer` 传递 `open/onOpenChange`，保持开关与主布局同步

### 1.2 PR 抽屉改为受控组件
- 文件：`src/features/reviews/ui/ReviewDrawer.tsx`
- 改动：
  1. 删除内部 `open` 状态，改为受控 `open` + `onOpenChange`
  2. 抽屉关闭、按钮打开均通过父级状态回调

### 1.3 Markdown 详情区自适应
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 改动：
  1. 去掉正文卡片固定最大宽（移除 `xl: 900`）
  2. 主文档卡片设置 `width: 100%` + `minWidth: 0`，占满可用空间
  3. 大纲侧栏宽度改为 `clamp(220px, 24vw, 320px)`
  4. 无大纲时不渲染侧栏容器，避免占位

## 2. 结果

- 在大屏下：
  - 右侧 PR 抽屉关闭后，文档详情区域会自动扩展
  - 右侧 PR 抽屉打开后，文档区域自动收缩但保持可读布局
- 在中小屏下：文档正文与大纲按断点自动堆叠。

## 3. 验证

- 构建命令：`pnpm build`
- 结果：通过（编译、类型检查、静态页面生成均成功）
