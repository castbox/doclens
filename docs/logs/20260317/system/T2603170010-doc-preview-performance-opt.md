# 任务简报: 文档详情加载性能优化

## 背景
- 当前规模约 1839 条文档/PR 文件时，文档详情页仍有明显加载迟滞。
- 目标是在不改变可见行为的前提下，优化详情接口返回、Markdown 渲染和详情组件重渲染路径。

## 本次改动
- 详情接口合并星标状态：`/api/docs/file` 直接并发返回预览数据和星标状态，去掉详情页额外的星标请求。
- 服务端下沉 Markdown 预处理：`readFilePreview()` 直接返回已处理的 `renderedContent` 和 `headings`，前端不再重复做 Markdown 文本扫描。
- 增加服务端预览 LRU 缓存：按 `path + full/preview + mtime + size` 复用详情预览结果，减少重复打开的读盘和预处理。
- Markdown 详情拆包：新增 `DocMarkdownPreviewBody`，把 `@uiw/react-markdown-preview`、语法高亮和 Mermaid 相关逻辑拆成按需加载 chunk，只在打开 Markdown 文档时加载。
- 收紧详情请求副作用：`DocPreview` 的请求 effect 改为不再依赖父层内联回调，旧请求中止后不会反向覆盖当前加载态。
- 减少无关重渲染：Markdown 详情体从主组件中抽离，`location` 仅驱动代码/文本预览的定位滚动，不再拖着整棵 Markdown 预览树重建。
- 稳定父层回调：`DocsWorkspace` 为 `onNavigatePath`、`onLoaded`、`onStarChanged` 提供稳定回调，避免父层 rerender 牵连详情请求。

## 关键文件
- `app/api/docs/file/route.ts`
- `src/features/docs/domain/types.ts`
- `src/features/docs/services/docsFsService.ts`
- `src/features/docs/services/docsFsService.test.ts`
- `src/features/docs/ui/DocPreview.tsx`
- `src/features/docs/ui/DocMarkdownPreviewBody.tsx`
- `src/features/docs/ui/DocsWorkspace.tsx`

## 验证记录
- `pnpm test:run src/features/docs/services/docsFsService.test.ts`
- `pnpm build`

## 验证结果
- 测试通过。
- 构建通过。
- `next build` 输出中，`/docs` 路由 `First Load JS` 降到 `208 kB`，显著低于本轮优化前的 `761 kB`。

## 风险与后续建议
- 当前服务端 preview 仍然是整文件读取后截断，后续如果文档进一步增大，建议继续做流式 preview 读取和基于文件版本的共享缓存。
- 当前 `/api/docs/meta` 仍参与部分冷启动路径归一化；如果后续还要继续压低首次详情打开延迟，可考虑把 route 归一化与详情预览进一步并行化。
