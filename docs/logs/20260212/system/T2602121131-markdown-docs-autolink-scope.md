# Markdown docs 路径自动补链范围收敛简报

## 1. 目标
- 详情页 Markdown 渲染时，自动补链仅识别显式 `docs/...` 路径。
- 仅处理 `.md` 目标，保持已有 Markdown 链接的相对路径解析能力不变。

## 2. 变更内容
- 文件：`src/features/docs/domain/markdownPreviewTransform.ts`
- 调整：`DOC_MARKDOWN_PATH_PATTERN` 由多前缀匹配（`docs/`、`./`、`../`、`/`）收敛为仅 `docs/` 前缀。

- 文件：`src/features/docs/domain/markdownPreviewTransform.test.ts`
- 新增用例：`仅对 docs 前缀路径做自动补链`
  - 断言 `./a.md`、`../b.md`、`/c.md` 不会被自动补链
  - 断言 `docs/prd/doclens_prd.md` 会被自动补链

## 3. 行为保持说明
- 未改动 `resolveMarkdownDocPath` 的逻辑：已有 Markdown 链接（`[text](...)`）中的相对 `.md` 路径依然可解析并跳转详情页。
- 未改动详情页 `a` 标签点击处理、锚点传递和同页跳转行为。

## 4. 验证记录
- 单测：
  - 命令：`pnpm test:run src/features/docs/domain/markdownPreviewTransform.test.ts`
  - 结果：`9 passed (9)`

- 构建：
  - 命令：`pnpm build`
  - 结果：构建成功（Next.js 14.2.35，静态与动态路由生成完成）

## 5. 风险与回滚
- 风险：文档正文中的纯文本相对路径（`./`、`../`、`/`）不再自动转链接；若团队存在该写法依赖，需要改为 `docs/...` 或使用标准 Markdown 链接语法。
- 回滚：恢复以下文件到本次提交前版本并重新执行 `pnpm build`
  - `src/features/docs/domain/markdownPreviewTransform.ts`
  - `src/features/docs/domain/markdownPreviewTransform.test.ts`
