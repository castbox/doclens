# Mermaid 全屏预览功能简报

## 1. 变更目标
- 在 `/docs` 详情页 Mermaid 图表中增加“全屏预览”能力。
- 保持现有 Mermaid 渲染链路与失败兜底行为不变。

## 2. 主要改动
### 2.1 Mermaid 预览头部操作
- 文件：`src/features/docs/ui/MermaidCodeBlock.tsx`
- 在 Mermaid 图表块顶部新增操作区：
  - 展示“Mermaid 图表”标签
  - 新增“全屏预览”按钮（图标按钮）
  - 仅在渲染成功且非加载态时可点击

### 2.2 全屏预览弹层
- 文件：`src/features/docs/ui/MermaidCodeBlock.tsx`
- 新增全屏 `Dialog`：
  - 标题栏：`Mermaid 全屏预览`
  - 关闭按钮：右上角 `Close`
  - 内容区：自适应滚动容器，展示 Mermaid SVG
  - SVG 在全屏中按宽度自适应展示，兼容桌面与移动端

### 2.3 失败兜底保持
- Mermaid 渲染失败时仍展示：
  - 警告信息
  - Mermaid 源码块（带行号）
- 全屏按钮在失败场景保持禁用，避免进入空视图。

## 3. 行为保持说明
- 未改动 `DocPreview` 的 Mermaid 分支判定与非 Mermaid 代码块渲染策略。
- 未改动 Markdown 目录提取、锚点跳转、docs 内链等行为。

## 4. 验证记录
### 4.1 单测
- 命令：`pnpm test:run`
- 结果：通过（6 files, 25 tests）

### 4.2 构建
- 命令：`pnpm build`
- 结果：通过（Next.js 14.2.35，编译/类型检查/静态页面生成成功）

## 5. 风险与后续
- 风险较低，主要为 UI 交互扩展。
- 若后续有需求，可在全屏视图中补充缩放比例控制与导出图片能力。

## 6. 回滚方案
1. 回滚 `src/features/docs/ui/MermaidCodeBlock.tsx` 本次新增的全屏按钮与 `Dialog` 逻辑。
2. 重新执行 `pnpm build` 验证回滚后可编译。
