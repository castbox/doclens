# DocLens UI 工作台风格升级简报

- 时间：2026-02-07 03:37
- 任务：基于既有功能实现“专业静稳 + 自适应密度”的体验升级

## 1. 目标

在不改变业务行为（docs 浏览、搜索、审阅流转）的前提下，统一视觉基线并优化核心路径体验：

1. 左侧目录浏览更易扫读
2. 中央预览阅读更稳定（长文/代码定位）
3. 搜索输入与结果理解成本更低
4. 右侧 PR 面板状态感知更明显

## 2. 主要改动

### 2.1 主题与全局基线

- `src/lib/theme.ts`
  - 收敛颜色与边框语义（背景、divider、action hover/selected）
  - 提升组件一致性（Button、OutlinedInput、ListItemButton、Chip）
  - 强化焦点可见性与交互过渡时长（180ms）
- `app/globals.css`
  - 调整背景梯度与轻量遮罩层
  - 增加滚动条样式与文字渲染优化

### 2.2 Docs 工作台

- `src/features/docs/ui/DocsWorkspace.tsx`
  - 顶部栏、左抽屉、内容容器视觉层级统一
  - 调整三栏留白与响应式内边距（自适应密度）
- `src/features/docs/ui/DocsTree.tsx`
  - 目录项选中态强化（边框 + 左侧标记条）
  - hover/focus 可感知，目录滚动区高度受控
- `src/features/docs/ui/DocPreview.tsx`
  - 预览头部操作区统一卡片化按钮
  - 代码行定位强化（高亮背景 + 左侧强调条）
  - Markdown 阅读宽度收敛，标题/表格/引用块样式统一
- `src/features/docs/ui/DocOutline.tsx`
  - 大纲面板卡片化，层级缩进与交互反馈优化
- `src/features/docs/ui/DocBreadcrumb.tsx`
  - 面包屑密度与文本截断策略优化

### 2.3 搜索体验

- `src/features/search/ui/SearchBar.tsx`
  - 搜索与筛选分层，命名更清晰（文件类型/排序方式）
- `src/features/search/ui/SearchPanel.tsx`
  - 空查询时提供提示与快捷关键词
- `src/features/search/ui/SearchResultList.tsx`
  - 命中卡片交互强化，行号标签与高亮对比优化
- `src/features/search/ui/SearchPageClient.tsx`
  - 搜索页视觉基线对齐工作台

### 2.4 审阅抽屉

- `src/features/reviews/ui/ReviewDrawer.tsx`
  - 小屏改为临时抽屉，大屏保留持久抽屉
  - 头部筛选区吸顶，列表滚动区独立
  - 已读/未读状态增加色点 + 文案双编码

### 2.5 状态组件

- `src/shared/ui/StateCard.tsx`
  - 加载态/空态统一为虚线边框轻卡片样式

## 3. 行为保持说明

本次仅涉及 UI 呈现与交互反馈样式，不改变 API、数据结构与业务流程：

- 未修改 `/api/docs/*`、`/api/search`、`/api/reviews*` 接口行为
- 未修改搜索参数、路径定位、已读标记、状态流转逻辑

## 4. 验证记录

- 构建校验：`pnpm build`
- 结果：通过（Next.js 14.2.35，类型检查与静态生成均成功）

## 5. 风险与后续建议

1. 当前 `ReviewDrawer` 的大屏内容预留宽度由页面固定留白处理，后续可改为由抽屉 open 状态驱动容器联动，减少关闭后的空白区域。
2. 搜索建议词为静态预设，后续可基于最近查询或热门词动态生成。
