# 任务简报：PR 文件面板“类别/创建时间”改为两行

## 1. 目标
- 将 PR 文件面板卡片中的“类别”和“创建时间”由同一行改为上下两行显示。

## 2. 变更内容
- 文件：`src/features/reviews/ui/ReviewDrawer.tsx`
- 调整：
  - `secondary` 区域不再使用同一行 `Stack` 左右排布。
  - 改为两个 `Typography`，分别显示：
    - `类别：{item.category}`
    - `创建：{formatDateTime(item.createdAt)}`

## 3. 影响评估
- 仅展示层变更，不涉及 API、类型、数据结构。
- 不影响 docs 只读与路径安全策略。

## 4. 验证记录
- 执行：`pnpm build`
- 结果：通过（Next.js 编译、类型检查均成功）。

## 5. 回滚方式
- 将 `secondary` 区域恢复为单行 `Stack` 布局即可。
