# 任务简报：复制路径增加 docs 前缀

## 变更
- 调整文档预览区“复制路径”按钮行为。
- 复制内容由 `path` 改为 `docs/<path>`。
- 复制成功后增加提示：`已复制 docs 路径`。

## 影响文件
- `src/features/docs/ui/DocPreview.tsx`

## 验证
- `pnpm build` 通过。
