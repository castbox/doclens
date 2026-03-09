import { Buffer } from "node:buffer";
import sharp from "sharp";
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

  it("expands svg and png size for wide diagrams instead of using a fixed viewport", async () => {
    const code = `flowchart LR
Start[DocLens Export]
Start --> A[shared/api-schema]
A --> B[docs/tools/openapi-sync-workflow.md]
B --> C[justfile/scripts]
C --> D[platform/api-types]
D --> E[frontend/hooks]
E --> F[review drawer]
F --> G[release checklist]
G --> H[workspace governance]
H --> I[docx export]
I --> J[verification]`;
    const svg = await renderMermaidSvgForExport(code);
    const pngDataUrl = await renderMermaidPngDataUrl(code);
    const widthMatch = svg.match(/<svg[^>]*\swidth="([^"]+)"/i);
    const heightMatch = svg.match(/<svg[^>]*\sheight="([^"]+)"/i);
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
    const pngBuffer = Buffer.from(pngDataUrl.split(",")[1], "base64");
    const pngMetadata = await sharp(pngBuffer).metadata();

    expect(widthMatch?.[1]).not.toBe("100%");
    expect(Number.parseFloat(widthMatch?.[1] ?? "0")).toBeGreaterThan(816);
    expect(Number.parseFloat(heightMatch?.[1] ?? "0")).toBeGreaterThan(40);
    expect(viewBoxMatch?.[1]).not.toBe("-8 -8 816 616");
    expect((pngMetadata.width ?? 0)).toBeGreaterThan(816);
    expect((pngMetadata.height ?? 0)).toBeGreaterThan(40);
  });
});
