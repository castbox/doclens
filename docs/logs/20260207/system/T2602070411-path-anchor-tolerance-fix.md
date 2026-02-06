# path 锚点容错修复简报

- 时间：2026-02-07 04:11
- 问题：搜索列表跳转到 `/docs?path=...#L162` 后，某些场景下 `path` 混入锚点导致详情加载失败。

## 修改内容

### 1) 新增路径锚点剥离工具
- 文件：`src/features/docs/domain/anchor.ts`
- 新增：`stripPathAnchor(pathValue)`
- 作用：统一移除 `path` 中误混入的 `#...` 片段。

### 2) 前端工作台容错
- 文件：`src/features/docs/ui/DocsWorkspace.tsx`
- 改动：
  1. 读取 query 的 `path` 后先 `stripPathAnchor`
  2. `selectPath` 写回 URL 前先去锚点，避免污染 `path`
  3. 若 `path` 内联携带 `#...`（编码场景），会解析为定位锚点并应用

### 3) API 侧容错
- 文件：`app/api/docs/file/route.ts`
- 文件：`app/api/docs/meta/route.ts`
- 文件：`app/api/docs/tree/route.ts`
- 改动：在读取 `path` 参数后统一 `stripPathAnchor`，再执行后续逻辑。
- 作用：即使前端传入污染的 `path`，服务端也能容错读取文件。

## 验证

- 执行：`pnpm build`
- 结果：通过（编译、类型检查、静态页生成均成功）

## 结果

- `/docs?path=xxx.md#L162` 不再因 `path` 污染导致详情加载失败。
- 行号定位能力保留。
