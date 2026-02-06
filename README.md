# DocLens

DocLens 是一个面向 `docs/` 目录的文档浏览 + 全文搜索 + 审阅单提效系统。

## 技术栈

- Next.js (App Router)
- TypeScript
- MUI
- SQLite (better-sqlite3 + Drizzle)
- ripgrep (rg) 全文搜索

## 环境变量

复制 `.env.example` 为 `.env` 并按需调整：

```bash
cp .env.example .env
```

## 开发命令

```bash
pnpm install
pnpm dev
pnpm test:run
pnpm build
```

## 冒烟步骤（P0）

1. 打开 `/docs`，验证左侧目录树可展开（懒加载）并支持过滤。
2. 选择 Markdown / 代码文件，验证预览渲染与 `#L120` 行定位。
3. 在 `/docs` 顶部搜索面板输入关键词，验证命中高亮并可跳转定位。
4. 在右侧审阅抽屉创建审阅单，进入 `/reviews/:id` 新增问题项并流转状态。

## 只读与安全

- docs 访问统一走 `resolve + normalize + root check`，禁止绝对路径与 `..`。
- 项目不提供 docs 写入 API，审阅数据单独写入 SQLite。
