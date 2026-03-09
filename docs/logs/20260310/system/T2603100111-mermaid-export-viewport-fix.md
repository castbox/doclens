# Mermaid 导出视口裁切修复

## 背景

用户反馈导出的 Mermaid 图“图片不全”。排查后发现，这次不是 Word 页面裁切，也不是 `html-to-docx` 的图片环绕问题，而是导出链路里生成的 PNG 本身就已经用了错误视口。

## 调研与判断

当前导出链路是：

1. Mermaid 在 Node + JSDOM 环境中生成 SVG
2. `sharp` 将 SVG 转为 PNG
3. Word 导出嵌入 PNG

复核 `mermaid` 当前源码可以看到：

- `setupViewPortForSVG` 会调用根 `svg.getBBox()` 计算 `viewBox`
- `useMaxWidth` 场景下根节点只会写 `width="100%"` 和 `style="max-width: ..."`

而我们的 JSDOM polyfill 里，根 `<svg>` 的 `getBBox()` 被固定返回 `800x600`，这会直接导致 Mermaid 输出的每张图都落成近似固定的：

- `viewBox="-8 -8 816 616"`
- `width="100%"`
- `style="max-width: 816px;"`

因此一旦真实图宽高超出这个假 bbox，导出的 PNG 就会出现：

- 大面积空白
- 右侧或上方内容被截断

这说明长期最优方案不是继续调 Word 样式，而是在 SVG 进入 `sharp` 前，先把根视口修正为真实图元范围。这样可以继续保持“无 Chromium 依赖”的静态导出链路，同时把 JSDOM 假 bbox 的误差关在 Mermaid 渲染服务内部。

## 实现

- 在 `src/features/docs/services/mermaidRenderService.ts` 新增内容感知的 SVG 归一化逻辑
  - 递归遍历 SVG 图元
  - 处理 Mermaid 常见的 `translate(...)` 变换
  - 计算 `rect/circle/ellipse/polygon/path/text` 的实际边界
  - 用真实边界重写根 `svg` 的 `width/height/viewBox`
  - 移除 Mermaid 默认写入的 `max-width`
- 保留原有静态导出 profile：
  - `htmlLabels: false`
  - `markdownAutoWrap: false`
  - `flowchart.htmlLabels: false`
- 继续保留 `<br>` -> `<br/>` 的 XML 兼容归一化

## 验证

- `pnpm test:run src/features/docs/services/mermaidRenderService.test.ts src/features/docs/domain/docExport.test.ts`
- `pnpm build`
- 真实样本复核：
  - 文件：`/Users/wangyongchang/Jobs/Code/adsynapse-smart-ads/docs/logs/20260309/sop/T2603092105-codex-cli-fullstack-sharing.md`
  - 修复前：6 个 Mermaid block 的 SVG 视口都接近固定 `816x616`
  - 修复后：
    - block 1: `2448.52 x 746.9`
    - block 2: `1664.84 x 1127.9`
    - block 3: `1618 x 329.9`
    - block 4: `884.96 x 518.7`
    - block 5: `1577.88 x 918.5`
    - block 6: `708.72 x 703.5`
- 实际导出 PNG 复核：
  - 问题样本 block 3 现在导出为 `1618 x 330`
  - 图像可见内容完整，不再被 `816x616` 视口截断

## 风险与后续

- 当前 bbox 归一化优先覆盖 Mermaid flowchart 的常见图元和 `translate` 变换，已经能覆盖这次问题样本。
- 若后续出现更复杂的 SVG 变换矩阵或其他 Mermaid 图型，再补对应图元/变换支持。
- 若未来导出需求进一步扩大到“完全等同浏览器排版”，再评估浏览器渲染 fallback；当前阶段没有必要为此引入 Chromium 运行时。
