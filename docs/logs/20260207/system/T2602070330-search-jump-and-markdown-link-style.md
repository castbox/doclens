# 任务简报：修复搜索结果跳转 + Markdown 代码橙色 + 文档内 md 链接 + 大纲 sticky

## 1. 需求
- 全文搜索列表点击后无法进入文档详情。
- 代码行字体颜色需要橙色。
- 文档内容中出现 docs 目录下的 markdown 路径时可点击跳转。
- 右侧文档大纲在滚动时保持可用（sticky）。

## 2. 实现
### 2.1 搜索结果点击跳转修复
- 将全局搜索页点击结果跳转改为：
  - `/docs/view?path=...&line=...`
  - 再由服务端重定向为 `/docs?path=...#L...`
- 这样可以稳定保留 line 定位参数。
- 影响文件：
  - `src/features/search/ui/SearchPageClient.tsx`
  - `app/docs/view/page.tsx`

### 2.2 Markdown 代码橙色
- 代码文件预览（code/text）行内容颜色改为橙色 `#C2410C`。
- Markdown 代码块语法高亮主题颜色统一映射为橙色。
- Markdown 行内代码样式同步橙色。
- 影响文件：`src/features/docs/ui/DocPreview.tsx`

### 2.3 文档内 docs markdown 路径自动可点击
- 渲染前对 markdown 文本做路径自动链接转换（仅针对 `.md` 路径，且跳过代码块）。
- 自定义 markdown `a` 渲染：
  - 识别可解析的 docs 内部 markdown 路径（含相对路径、`docs/...`、`/...`）
  - 点击后在 DocLens 内部跳转到对应文档
  - 若带 `#anchor`，跳转后同步定位 hash
- 影响文件：`src/features/docs/ui/DocPreview.tsx`

### 2.4 文档大纲 sticky
- 将右侧大纲容器在桌面端设为 `position: sticky`，滚动阅读时可持续选择条目。
- 影响文件：`src/features/docs/ui/DocPreview.tsx`

## 3. 验证
- 构建：`pnpm build` 通过。
- 单测：`pnpm test:run` 通过（3 files / 8 tests）。
