import { describe, expect, it } from "vitest";
import { renderMermaidPngDataUrl } from "./mermaidRenderService";

describe("renderMermaidPngDataUrl", () => {
  it("renders mermaid source to png data url", async () => {
    const imageDataUrl = await renderMermaidPngDataUrl("flowchart TD\nA-->B");

    expect(imageDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(imageDataUrl.length).toBeGreaterThan(200);
  });
});
