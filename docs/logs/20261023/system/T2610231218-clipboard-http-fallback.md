# 任务简报：修复公网 HTTP 下复制 Markdown 失败

## 背景

- 故障页面：`http://119.147.205.10:6617/docs?path=docs%2Farchitecture%2Fworktree-release-rule-simplification.md`
- 现象：点击“复制 Markdown 源文件”提示失败；浏览器堆栈为 `TypeError: Cannot read properties of undefined (reading 'writeText')`。
- 根因：公网 IP 的 HTTP 页面不是浏览器安全上下文，`navigator.clipboard` 通常不存在。
- 次级问题：Markdown 复制在点击后先等待网络请求，再写剪贴板；部分浏览器会因此丢失用户激活状态。

## 本次改动

- 新增 `src/shared/services/clipboardService.ts`，集中封装浏览器复制能力。
- 安全上下文优先使用 `navigator.clipboard.writeText`；公网 HTTP 或 API 缺失时使用同步的 `execCommand("copy")` 兼容路径。
- 兼容路径使用临时只读 textarea，复制后删除节点，并恢复原焦点、输入框选区和文档 Range。
- 复制服务返回结构化结果，捕获能力探测、权限拒绝、同步异常和兼容复制失败，保证不向 UI 泄漏 rejection。
- `DocPreview` 的“复制路径”改用统一服务并补充失败提示。
- Markdown 未截断时直接复制已加载原文；截断时预取完整原文并在按钮上显示加载态，点击时不再先等待网络。
- 复制按钮只在当前 `path` 对应的数据已加载时使用；Markdown 复制完成前若已切换文档，不再显示错页面的成功提示。
- 错误反馈延长为 6 秒，并提示使用 HTTPS 或打开原文件手动复制。

## 关键文件

- `src/shared/services/clipboardService.ts`
- `src/shared/services/clipboardService.test.ts`
- `src/features/docs/ui/DocPreview.tsx`

## 验证记录

- `pnpm exec vitest run src/shared/services/clipboardService.test.ts`：11 个用例通过。
- `pnpm test:run`：14 个测试文件、78 个用例通过。
- `pnpm exec tsc --noEmit --incremental false`：通过。
- 在隔离干净副本 `/tmp/doclens-build-clipboard-final-G1hLrc` 执行 `pnpm build`：通过，生成 17/17 静态页，构建 ID 为 `TSXTrO7_LdCUZf4rd1qow`。
- 当前环境没有 Chromium/Firefox，未执行真实浏览器系统剪贴板自动化测试。

## 上线后冒烟

1. 使用目标页面所在浏览器打开文档，在控制台确认 `location.protocol`、`window.isSecureContext` 和 `typeof navigator.clipboard`。
2. 在 `http://119.147.205.10:6617` 下分别点击“复制路径”和“复制 Markdown 源文件”，确认不再出现未处理异常，成功时粘贴内容与接口返回一致。
3. 若浏览器兼容复制仍被禁用，确认显示可执行失败提示，而不是假成功。
4. 在 HTTPS 或 `http://localhost` 下确认仍优先使用 Clipboard API，复制内容包含完整 Markdown 原文。

## 风险与后续建议

- `document.execCommand("copy")` 已被废弃，但在当前公网 HTTP 场景中是现实可用的兼容补充；长期应将入口迁移到 HTTPS。
- 兼容复制依赖用户点击手势，因此 Markdown 原文必须提前可用；本次已避免在点击后等待网络。
- HTTPS 传输仍是公网部署的长期安全要求，本次代码修复不替代证书和反向代理配置。
