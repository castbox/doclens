import { Buffer } from "node:buffer";
import sharp from "sharp";
import { JSDOM } from "jsdom";

let mermaidModulePromise: Promise<typeof import("mermaid").default> | null = null;
let environmentReady = false;
let renderQueue = Promise.resolve();

type SvgBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MermaidSvgPrototype = SVGElement & {
  getBBox?: () => SvgBBox;
  getComputedTextLength?: () => number;
};

function ensureMermaidEnvironment(): void {
  if (environmentReady) {
    return;
  }

  const dom = new JSDOM("<div id=\"doclens-mermaid-export-root\"></div>", {
    pretendToBeVisual: true
  });
  const { window } = dom;

  // Mermaid 在 Node 侧需要一个长期存在的 DOM 环境；这里集中初始化一次，避免导出时重复抖动全局对象。
  Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    SVGElement: window.SVGElement,
    DOMParser: window.DOMParser,
    XMLSerializer: window.XMLSerializer,
    getComputedStyle: window.getComputedStyle.bind(window)
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true
  });

  const svgPrototype = window.SVGElement.prototype as MermaidSvgPrototype;

  if (!svgPrototype.getBBox) {
    svgPrototype.getBBox = function getBBox(this: MermaidSvgPrototype) {
      const tagName = this.tagName.toLowerCase();
      const widthAttr = Number.parseFloat(this.getAttribute?.("width") ?? "");
      const heightAttr = Number.parseFloat(this.getAttribute?.("height") ?? "");

      if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr) && widthAttr > 0 && heightAttr > 0) {
        return {
          x: 0,
          y: 0,
          width: widthAttr,
          height: heightAttr
        };
      }

      if (tagName === "svg") {
        return {
          x: 0,
          y: 0,
          width: 800,
          height: 600
        };
      }

      const text =
        tagName === "text" || tagName === "tspan"
          ? this.textContent ?? ""
          : Array.from(this.querySelectorAll?.("text, tspan") ?? [])
              .map((node) => node.textContent ?? "")
              .join(" ");
      const fontSize = Number.parseFloat(this.getAttribute?.("font-size") ?? "16") || 16;

      return {
        x: 0,
        y: 0,
        width: Math.max(text.length * fontSize * 0.62, fontSize),
        height: fontSize * 1.4
      };
    };
  }

  if (!svgPrototype.getComputedTextLength) {
    svgPrototype.getComputedTextLength = function getComputedTextLength(this: MermaidSvgPrototype) {
      return this.getBBox?.().width ?? 0;
    };
  }

  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (callback) => {
      return window.setTimeout(() => {
        callback(Date.now());
      }, 0);
    };
  }

  if (!globalThis.cancelAnimationFrame) {
    globalThis.cancelAnimationFrame = (handle) => {
      window.clearTimeout(handle);
    };
  }

  environmentReady = true;
}

async function loadMermaid() {
  ensureMermaidEnvironment();

  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => {
      const mermaid = module.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true
      });
      return mermaid;
    });
  }

  return mermaidModulePromise;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMermaidSvg(svg: string): string {
  // Mermaid 在 foreignObject XHTML 里会输出 `<br>`；对浏览器没问题，但 `sharp/libvips` 按 XML 解析时要求自闭合。
  return svg.replace(/<br\s*>/g, "<br/>");
}

export async function renderMermaidPngDataUrl(code: string): Promise<string> {
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error("Mermaid 图表内容为空");
  }

  const task = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(randomId("doclens-export-mermaid"), trimmedCode);
    const normalizedSvg = normalizeMermaidSvg(svg);
    const pngBuffer = await sharp(Buffer.from(normalizedSvg)).png().toBuffer();
    return `data:image/png;base64,${pngBuffer.toString("base64")}`;
  });

  renderQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}
