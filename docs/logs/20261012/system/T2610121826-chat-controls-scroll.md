# 文档聊天控件与底部滚动修复

## 最终行为

- 聊天 Mermaid 放大按钮位于图表左上角，大小 44×44px；移除 Tooltip 和外层占位 span，保留可访问名称。图表预留 52px 左侧空间，按钮与图表相距 4px，不遮挡节点；内嵌图仍最高占页面高度的 1/3。
- “回到底部”只显示 44×44px 向下箭头图标，点击立即定位实际末尾并恢复后续跟随。
- 使用 ResizeObserver 观察消息内容和滚动区域大小，处理图表延迟渲染、输入区变高及窗口尺寸变化；用户上翻阅读时保持位置，加载更早记录的既有锚点优先。
- 保持 Markdown 渲染组件类型稳定，控件状态更新不会重新挂载已完成图表；记录滚动方向，避免把内容变高产生的 scroll 事件误判为用户上翻。

已同步 [PRD FR-14 / 验收项 17–18](../../../prd/doclens_prd.md) 和 [README 冒烟步骤 15–16](../../../../README.md)。涉及 `MermaidCodeBlock.tsx`、`DocumentChatDialog.tsx`、`ChatMessage.tsx`，聊天 API、历史存储、文档全文上下文及普通文档图表接口保持。

## 验证与证据

原问题已复现：长回复中的 Mermaid 完成渲染后，桌面距实际末尾仍有 120.5px，最后一行在输入区下方。旧 Markdown 组件身份变化也会导致控件更新时图表重挂载，再次改变消息高度。

| 场景 | 桌面 1440×900 | 手机 375×812 |
| --- | --- | --- |
| Mermaid 完成后 | 到达末尾，最后一行可见 | 到达末尾，最后一行可见 |
| 点击仅有箭头的按钮 | 距末尾约 0.5px，图表 ID 保持 | 距末尾约 0.5px，图表 ID 保持 |
| 用户上翻后内容变高 | scrollTop 保持 3059.5px | scrollTop 保持 5638.5px |
| 回到末尾后继续增高 | 继续跟随，最后一行可见 | 继续跟随，最后一行可见 |
| 输入六行草稿 / 窗口缩至 600px 高 | 继续跟随，误差最多 1px | 继续跟随，误差约 0.5px |

不足 1px 的差异来自浏览器整数高度与小数坐标的取整，最后一行始终在消息可视区域内。动态高度验收通过临时 DOM 布局变化模拟，不执行模型生成。

- [桌面滚动记录（包含修复前基线）](T2610121826-chat-scroll-desktop.json)、[手机滚动记录](T2610121826-chat-scroll-mobile.json)。
- [图表控件记录](T2610121826-mermaid-button-browser.json)：桌面 / 手机横向、竖向图共四组通过；悬停后 tooltip 数为 0、无原生 title、按钮位置左上各偏移 4px，放大仍为 140×798px 自然尺寸。
- [最终生产构建回放](T2610121826-chat-controls-production.json)：两种视口再次确认初始到末尾、点击箭头、后续高度增长均通过，图表 ID 保持；浏览器控制台无错误、无警告。
- 截图已人工复核：[桌面图表](T2610121826-mermaid-button-desktop.png)、[手机图表](T2610121826-mermaid-button-mobile.png)、[桌面箭头](T2610121826-chat-scroll-desktop.png)、[手机箭头](T2610121826-chat-scroll-mobile.png)、[桌面末尾](T2610121826-chat-bottom-desktop.png)、[手机末尾](T2610121826-chat-bottom-mobile.png)。
- `pnpm test:run`：23 个文件、180 项通过；[测试输出](T2610121826-chat-controls-tests.txt)。
- `pnpm build`：最终编译、类型检查及构建通过；[构建输出](T2610121826-mermaid-button-build.txt)。使用与工作区五个改动文件 SHA-256 一致的独立代码快照执行，避免共享 `.next` 干扰验证。
- 全部浏览器验收使用自建文档与独立 SQLite 预置历史，生成 POST 为 0；验收服务密钥置空，未调用模型，未复制本地 `.env`。Node 与 better-sqlite3 均为 arm64。
- AppleDouble 使用本机 `clean-appledouble` 对仓库显式 dry-run，匹配 0 个、错误 0 个。

## 影响与回滚

改动限于聊天界面控件与滚动跟随，未调整数据库 schema 或 docs 读取规则。原有未跟踪 `test.zip` 保留，本地密钥不进入代码和验收产物。回滚可 revert 本次 fix commit，无需删除历史或执行数据迁移。
