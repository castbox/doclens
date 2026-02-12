# 目录 Path 过滤支持与 `scope/path` 语义改造

## 1. 目标
- 修复 `/docs?path=<目录>` 场景报错 `Path is not a file`。
- 支持目录 URL 作为筛选作用域，并保持文件预览稳定。

## 2. 主要改动

### 2.1 API 与服务层
- `app/api/docs/meta/route.ts`
  - 从 `readFileMeta` 切换为 `readPathMeta`。
- `src/features/docs/services/docsFsService.ts`
  - 新增 `readPathMeta(inputPath)`，支持返回文件或目录节点类型。
- `src/features/docs/domain/types.ts`
  - 新增 `PathMetaPayload` 联合类型：
    - `nodeType: "file"`（含 size/kind）
    - `nodeType: "directory"`（含 modifiedAt）

### 2.2 路由语义与前端状态
- 新增 `src/features/docs/domain/urlState.ts`
  - `normalizeDocsRouteState`
  - `isPathWithinScope`
- `src/features/docs/ui/DocsWorkspace.tsx`
  - 新增 `scope` 参数处理。
  - 对 URL 参数进行规范化：
    - `path` 指向目录时自动迁移为 `scope`。
    - `scope` 非目录时自动回退。
    - `scope + path` 不在同一子树时自动清理 `path`。
  - `selectPath` 时保留 `scope`；若目标不在当前 `scope` 下则自动移除 `scope`。

### 2.3 目录树子树模式
- `src/features/docs/ui/DocsTree.tsx`
  - 新增 `scopePath` 入参。
  - 目录树根从固定 `""` 改为 `scopePath`。
  - scope 切换时重置树缓存与展开状态。
  - 左侧显示“当前目录范围”。

### 2.4 测试
- 新增 `src/features/docs/domain/urlState.test.ts`（7 条用例）
  - 覆盖目录 path 迁移为 scope、scope 文件回退、跨 scope 清理 path 等核心语义。

## 3. 验证记录
- 单测：
  - `pnpm test:run src/features/docs/domain/urlState.test.ts` ✅
  - `pnpm test:run src/features/docs/domain/pathRules.test.ts` ✅
- 构建：
  - `pnpm build` ✅（Next.js 编译、类型检查、静态页生成均通过）

## 4. 风险与回滚
- 风险：`DocsWorkspace` 在 URL 变化时会触发路径元信息校验，依赖 `/api/docs/meta` 可用性。
- 回滚：可按文件回退以下改动点：
  - `DocsWorkspace.tsx` 的 `scope/path` 规范化逻辑
  - `DocsTree.tsx` 的 `scopePath` 根目录模式
  - `api/docs/meta` 与 `readPathMeta` 扩展
