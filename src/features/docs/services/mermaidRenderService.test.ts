import { describe, expect, it } from "vitest";
import { renderMermaidPngDataUrl, renderMermaidSvgForExport } from "./mermaidRenderService";

describe("renderMermaidPngDataUrl", () => {
  it("renders mermaid source to png data url", async () => {
    const imageDataUrl = await renderMermaidPngDataUrl("flowchart TD\nA-->B");

    expect(imageDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(imageDataUrl.length).toBeGreaterThan(200);
  });

  it("handles labels containing html line breaks", async () => {
    const imageDataUrl = await renderMermaidPngDataUrl("flowchart LR\nA[OpenAPI<br/>SSOT] --> B[TypeGen<br/>Output]");

    expect(imageDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(imageDataUrl.length).toBeGreaterThan(200);
  });

  it("uses a static svg profile without foreignObject labels", async () => {
    const svg = await renderMermaidSvgForExport(
      "flowchart TD\nA[Next.js页面] --> B[shared/api-schema\\nOpenAPISSOT]\nC[AGENTS.md] -.约束.-> A"
    );

    expect(svg.includes("foreignObject")).toBe(false);
    expect(svg.includes("<text")).toBe(true);
    expect(svg.includes("Next.js页面")).toBe(true);
  });
});
