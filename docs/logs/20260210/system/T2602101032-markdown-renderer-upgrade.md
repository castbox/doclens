# Markdown 渲染内核升级简报

## 1. 变更目标
- 将详情页 Markdown 渲染内核替换为 `@uiw/react-markdown-preview`。
- 保持既有交互行为：目录提取与跳转、docs 内链跳转、代码块高亮、自定义样式、定位逻辑。
- 引入“受限 HTML 白名单”策略，降低 XSS 风险。

## 2. 主要改动
### 2.1 渲染器替换
- 文件：`src/features/docs/ui/DocPreview.tsx`
- 将 `react-markdown` 替换为 `@uiw/react-markdown-preview`。
- 保留自定义 `components`：
  - 标题组件：继续使用 `extractMarkdownHeadings` 的 slug。
  - 链接组件：保留 docs 内部路径解析和同页 hash 跳转。
  - `code` 组件：保留 `react-syntax-highlighter` 展示风格。
- 通过 `pluginsFilter` 注入 `rehype-sanitize`，并移除默认的 `rehype-prism` 插件，避免与自定义代码渲染冲突。
- 通过 `rehypeRewrite` 去除自动注入的 heading 锚点图标，保持现有阅读体验。

### 2.2 领域逻辑拆分（行为保持式）
- 新增：`src/features/docs/domain/markdownPreviewTransform.ts`
- 从 `DocPreview` 提取纯函数：
  - `preserveDiffSectionLineBreaks`
  - `autoLinkDocsMarkdownPaths`
  - `normalizeDocsRelativePath`
  - `resolveMarkdownDocPath`
  - `buildAnchorHash`

### 2.3 安全策略
- 新增：`src/features/docs/domain/markdownSanitize.ts`
- 基于 `rehype-sanitize` 默认 schema 扩展受限白名单：
  - 允许常见展示标签（如 `details/summary/table/img` 等）
  - 限制链接协议与关键属性
  - 显式剔除 `script/style`

### 2.4 测试补充
- 新增：`src/features/docs/domain/markdownPreviewTransform.test.ts`
- 新增：`src/features/docs/domain/markdownSanitize.test.ts`
- 覆盖自动链接、路径解析、越界拦截、Diff 换行策略、sanitize 白名单和危险输入拦截。

## 3. 依赖变更
- 新增依赖：
  - `@uiw/react-markdown-preview@5.1.5`
  - `rehype-sanitize@6.0.0`
- 移除依赖：
  - `react-markdown`

## 4. 验证记录
### 4.1 单测
- 命令：`pnpm test:run`
- 结果：通过（5 files, 19 tests）

### 4.2 构建
- 命令：`pnpm build`
- 结果：通过（Next.js 14.2.35，类型检查与静态页面生成成功）

## 5. 风险与关注点
- `@uiw/react-markdown-preview` 默认插件链较重，已通过 `pluginsFilter` 去掉 `rehype-prism` 并保留 sanitize 兜底。
- 白名单采用受限策略，若后续文档出现新的 HTML 标签/属性需求，需要按需扩展 `markdownSanitizeSchema`。

## 6. 回滚方案
1. 回滚 `DocPreview` 到 `react-markdown` 渲染实现。
2. 删除新增 domain 文件与测试：
   - `src/features/docs/domain/markdownPreviewTransform.ts`
   - `src/features/docs/domain/markdownSanitize.ts`
   - 对应 `.test.ts` 文件
3. 移除新增依赖并重新安装锁文件。
