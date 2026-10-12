import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { WindowLike } from "dompurify";
import { sanitizeMermaidSvg } from "@/features/docs/domain/mermaidSvg";

const openWindows: JSDOM[] = [];

function createWindow(): Window {
  const dom = new JSDOM("");
  openWindows.push(dom);
  return dom.window as unknown as Window;
}

afterEach(() => {
  for (const dom of openWindows.splice(0)) {
    dom.window.close();
  }
});

describe("sanitizeMermaidSvg", () => {
  it("保留中文 foreignObject 标签、图表样式和本地 marker 引用，并恢复图表自然尺寸", () => {
    const domWindow = createWindow();
    const safeSvg = sanitizeMermaidSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560">
        <style>.edgePath{stroke:#334155;marker-end:url(#arrowhead)}.nodeLabel{font-size:16px}</style>
        <defs><marker id="arrowhead"><path d="M0 0L8 4L0 8z"/></marker></defs>
        <path class="edgePath" d="M0 0L10 10"/>
        <foreignObject width="200" height="40">
          <div xmlns="http://www.w3.org/1999/xhtml" class="nodeLabel"><p>文档摘要</p></div>
        </foreignObject>
      </svg>`,
      domWindow as unknown as WindowLike,
      { preserveViewBoxSize: true }
    );
    const svg = new domWindow.DOMParser().parseFromString(safeSvg, "image/svg+xml").documentElement;

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("width")).toBe("900");
    expect(svg.getAttribute("height")).toBe("560");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.querySelector("foreignObject p")?.textContent).toBe("文档摘要");
    expect(svg.querySelector("style")?.textContent).toContain("url(#arrowhead)");
    expect(svg.querySelector(".edgePath")?.getAttribute("class")).toBe("edgePath");
  });

  it("移除脚本、事件处理器、嵌入媒体与外部 CSS 资源，同时保留本地 marker", () => {
    const domWindow = createWindow();
    const safeSvg = sanitizeMermaidSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" onload="alert(1)">
        <style>@import url(https://attacker.invalid/a.css);.unsafe{fill:url(https://attacker.invalid/a.svg#x)}.safe{marker-end:url(#arrowhead)}</style>
        <script>alert(1)</script>
        <image href="https://attacker.invalid/pixel.png"/>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onmouseover="alert(2)"><iframe src="https://attacker.invalid/"></iframe>安全标签</div></foreignObject>
        <path class="safe" style="fill:url(#arrowhead);background:url(https://attacker.invalid/pixel.png)"/>
      </svg>`,
      domWindow as unknown as WindowLike
    );
    const svg = new domWindow.DOMParser().parseFromString(safeSvg, "image/svg+xml").documentElement;

    expect(safeSvg).not.toMatch(/<script|<iframe|<image|onload=|onmouseover=|https:\/\/|@import/i);
    expect(svg.querySelector("foreignObject")?.textContent).toContain("安全标签");
    expect(svg.querySelector("style")?.textContent).toContain("url(#arrowhead)");
    expect(svg.querySelector(".safe")?.getAttribute("style")).toContain("url(#arrowhead)");
  });
});
