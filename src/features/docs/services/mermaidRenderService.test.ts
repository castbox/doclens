import { describe, expect, it } from "vitest";
import { renderMermaidPngDataUrl } from "./mermaidRenderService";

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
});
