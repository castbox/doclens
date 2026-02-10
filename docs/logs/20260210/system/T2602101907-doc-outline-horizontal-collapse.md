# 文档大纲水平折叠增强简报

## 1. 变更目标
- 将“文档大纲收起/展开”调整为**水平折叠**，为详情正文让出更多展示空间。

## 2. 主要改动
### 2.1 大纲组件支持受控折叠状态
- 文件：`src/features/docs/ui/DocOutline.tsx`
- 新增入参：
  - `collapsed?: boolean`
  - `onToggleCollapsed?: () => void`
- 兼容受控/非受控两种模式。
- 折叠时仅保留居中的切换按钮，不占用标题行文本宽度。

### 2.2 详情页接入水平宽度折叠
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 新增状态：`outlineCollapsed`
- 大纲栏宽度规则（`md` 及以上）：
  - 展开：`clamp(220px, 24vw, 320px)`
  - 折叠：`52px`
- 增加宽度过渡动画，折叠/展开更平滑。

## 3. 行为保持说明
- 大纲项点击跳转逻辑保持不变。
- Markdown 渲染、Mermaid、PDF/文本预览、搜索定位逻辑无变更。

## 4. 验证记录
### 4.1 单测
- 命令：`pnpm test:run`
- 结果：通过（6 files, 25 tests）

### 4.2 构建
- 命令：`pnpm build`
- 结果：通过（Next.js 14.2.35，编译/类型检查/静态页面生成成功）

## 5. 风险与回滚
- 风险较低，范围仅前端 UI 布局与交互状态。
- 回滚：恢复 `DocOutline.tsx` 与 `DocPreview.tsx` 本次改动并重新构建验证。
