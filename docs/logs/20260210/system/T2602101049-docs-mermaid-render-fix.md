# Docs 详情页 Mermaid 渲染修复简报

## 1. 变更目标
- 修复 `/docs` 详情页中 Mermaid 代码块不渲染的问题。
- 保持非 Mermaid Markdown/代码块行为不变。
- 当 Mermaid 渲染失败时，展示错误信息并回退显示源码块。

## 2. 根因分析
- `src/features/docs/ui/DocPreview.tsx` 使用了自定义 `components.code` 渲染器。
- 该渲染器统一走 `react-syntax-highlighter`，未对 `language-mermaid` 做专门处理。
- `@uiw/react-markdown-preview` 本身不会自动将 Mermaid 文本渲染为图，需在 `code` 组件里显式接入 `mermaid.render`。

## 3. 主要改动
### 3.1 Mermaid 领域函数
- 新增：`src/features/docs/domain/mermaid.ts`
  - `isMermaidLanguage`：识别 Mermaid 代码块 className。
  - `normalizeCodeBlockSource`：统一换行并去除尾部单个换行。

### 3.2 Mermaid 渲染组件
- 新增：`src/features/docs/ui/MermaidCodeBlock.tsx`
  - 动态加载 `mermaid`，按需初始化。
  - 成功渲染时输出 SVG。
  - 失败时显示告警 + Mermaid 源码块（含行号）。

### 3.3 详情页接入
- 修改：`src/features/docs/ui/DocPreview.tsx`
  - 在 `components.code` 中新增 `language-mermaid` 分支。
  - Mermaid 走 `MermaidCodeBlock`。
  - 非 Mermaid 继续沿用原有语法高亮逻辑。

### 3.4 依赖变更
- 新增依赖：`mermaid@11.12.2`
- 更新：`pnpm-lock.yaml`

### 3.5 测试补充
- 新增：`src/features/docs/domain/mermaid.test.ts`
  - 覆盖 Mermaid 语言识别。
  - 覆盖代码块源码规范化逻辑。

## 4. 验证记录
### 4.1 单测
- 命令：`pnpm test:run`
- 结果：通过（6 files, 25 tests）

### 4.2 构建
- 命令：`pnpm build`
- 结果：通过（Next.js 14.2.35，编译/类型检查/静态页面生成成功）

## 5. 风险与关注点
- Mermaid 在客户端异步渲染，首次展示会有短暂加载态。
- 引入 Mermaid 后 `/docs` 页面前端包体积有增长，后续可评估按文档类型进一步延迟加载策略。

## 6. 回滚方案
1. 回滚 `DocPreview` 对 Mermaid 分支的接入。
2. 删除新增文件：
   - `src/features/docs/domain/mermaid.ts`
   - `src/features/docs/domain/mermaid.test.ts`
   - `src/features/docs/ui/MermaidCodeBlock.tsx`
3. 移除 `mermaid` 依赖并更新锁文件。
