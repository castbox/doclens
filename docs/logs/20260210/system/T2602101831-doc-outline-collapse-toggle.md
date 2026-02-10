# 文档大纲收起/展开功能简报

## 1. 变更目标
- 为文档详情页右侧“文档大纲”增加可收起/展开能力。
- 保持大纲项点击跳转行为不变。

## 2. 主要改动
### 2.1 大纲头部增加开关
- 文件：`src/features/docs/ui/DocOutline.tsx`
- 新增头部操作区（标题 + 图标按钮）：
  - 展开状态显示“收起”图标
  - 收起状态显示“展开”图标
  - 提供 `aria-label` 便于可访问性

### 2.2 大纲列表可折叠
- 文件：`src/features/docs/ui/DocOutline.tsx`
- 通过本地状态 `collapsed` 控制 `Collapse` 显隐。
- 默认展开，点击按钮切换。
- 收起时仅保留标题与操作按钮。

## 3. 行为保持说明
- 大纲项缩进、样式、滚动定位逻辑保持不变。
- Markdown 内容渲染、Mermaid 渲染、搜索跳转等功能无变更。

## 4. 验证记录
### 4.1 单测
- 命令：`pnpm test:run`
- 结果：通过（6 files, 25 tests）

### 4.2 构建
- 命令：`pnpm build`
- 结果：通过（Next.js 14.2.35，编译/类型检查/静态页面生成成功）

## 5. 风险与回滚
- 风险较低，仅 UI 交互层本地状态变更。
- 回滚方式：恢复 `src/features/docs/ui/DocOutline.tsx` 到变更前版本并重新执行 `pnpm build`。
