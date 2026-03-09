import { Buffer } from "node:buffer";
import sharp from "sharp";
import { JSDOM } from "jsdom";

let mermaidModulePromise: Promise<typeof import("mermaid").default> | null = null;
let environmentReady = false;
let renderQueue = Promise.resolve();

const mermaidExportConfig = {
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  htmlLabels: false,
  markdownAutoWrap: false,
  flowchart: {
    htmlLabels: false
  }
} as const;

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

type BoundsAccumulator = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const MERMAID_EXPORT_PADDING = 8;
const DEFAULT_FONT_SIZE = 16;
const NUMBER_PATTERN = /-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi;
const PATH_TOKEN_PATTERN = /[AaCcHhLlMmQqSsTtVvZz]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g;

function parseSvgNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatSvgNumber(value: number): string {
  const roundedValue = Math.round(value * 100) / 100;
  return Number.isInteger(roundedValue) ? String(roundedValue) : String(roundedValue);
}

function expandBounds(bounds: BoundsAccumulator | null, x: number, y: number): BoundsAccumulator {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return bounds ?? {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0
    };
  }

  if (!bounds) {
    return {
      minX: x,
      minY: y,
      maxX: x,
      maxY: y
    };
  }

  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
  return bounds;
}

function expandRectBounds(
  bounds: BoundsAccumulator | null,
  x: number,
  y: number,
  width: number,
  height: number
): BoundsAccumulator {
  let nextBounds = expandBounds(bounds, x, y);
  nextBounds = expandBounds(nextBounds, x + width, y + height);
  return nextBounds;
}

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) {
    return { x: 0, y: 0 };
  }

  const translatePattern = /translate\(([^)]+)\)/gi;
  let offsetX = 0;
  let offsetY = 0;

  for (const match of transform.matchAll(translatePattern)) {
    const values = match[1].match(NUMBER_PATTERN)?.map((value) => Number.parseFloat(value)) ?? [];
    offsetX += values[0] ?? 0;
    offsetY += values[1] ?? 0;
  }

  return { x: offsetX, y: offsetY };
}

function parsePoints(pointsValue: string): Array<{ x: number; y: number }> {
  const values = pointsValue.match(NUMBER_PATTERN)?.map((value) => Number.parseFloat(value)) ?? [];
  const points: Array<{ x: number; y: number }> = [];

  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }

  return points;
}

function measureTextElementBounds(
  element: Element,
  offsetX: number,
  offsetY: number,
  bounds: BoundsAccumulator | null
): BoundsAccumulator | null {
  const textContent = element.textContent?.replace(/\s+/g, " ").trim();
  if (!textContent) {
    return bounds;
  }

  const fontSize = parseSvgNumber(element.getAttribute("font-size")) ?? DEFAULT_FONT_SIZE;
  const lineElements = Array.from(element.querySelectorAll("tspan.text-outer-tspan"));
  const lines = lineElements.length > 0 ? lineElements.map((lineElement) => lineElement.textContent?.trim() ?? "") : [textContent];
  const maxLineLength = Math.max(...lines.map((line) => line.length), textContent.length, 1);
  const lineCount = Math.max(lines.length, 1);
  const textX = parseSvgNumber(element.getAttribute("x")) ?? 0;
  const textY = parseSvgNumber(element.getAttribute("y")) ?? 0;
  const width = Math.max(maxLineLength * fontSize * 0.62, fontSize);
  const height = Math.max(lineCount * fontSize * 1.3, fontSize);

  return expandRectBounds(bounds, offsetX + textX, offsetY + textY - fontSize, width, height);
}

function measurePathBounds(
  pathData: string,
  offsetX: number,
  offsetY: number,
  bounds: BoundsAccumulator | null
): BoundsAccumulator | null {
  const tokens = pathData.match(PATH_TOKEN_PATTERN) ?? [];
  const isCommandToken = (value: string) => /^[AaCcHhLlMmQqSsTtVvZz]$/.test(value);
  let index = 0;
  let command = "";
  let previousCommand = "";
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let lastCubicControlX = 0;
  let lastCubicControlY = 0;
  let lastQuadraticControlX = 0;
  let lastQuadraticControlY = 0;

  const includePoint = (x: number, y: number) => {
    bounds = expandBounds(bounds, offsetX + x, offsetY + y);
  };
  const readNumber = () => Number.parseFloat(tokens[index++]);

  while (index < tokens.length) {
    if (isCommandToken(tokens[index])) {
      command = tokens[index++];
    } else if (!command) {
      break;
    }

    switch (command) {
      case "M":
      case "m": {
        const isRelative = command === "m";

        while (index + 1 < tokens.length && !isCommandToken(tokens[index])) {
          const nextX = readNumber();
          const nextY = readNumber();
          currentX = isRelative ? currentX + nextX : nextX;
          currentY = isRelative ? currentY + nextY : nextY;
          includePoint(currentX, currentY);
          startX = currentX;
          startY = currentY;
          command = isRelative ? "l" : "L";
          previousCommand = isRelative ? "m" : "M";
        }

        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      }
      case "L":
      case "l":
      case "T":
      case "t": {
        const isRelative = command === "l" || command === "t";

        while (index + 1 < tokens.length && !isCommandToken(tokens[index])) {
          const nextX = readNumber();
          const nextY = readNumber();
          currentX = isRelative ? currentX + nextX : nextX;
          currentY = isRelative ? currentY + nextY : nextY;
          includePoint(currentX, currentY);
        }

        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        if (command === "T" || command === "t") {
          if (previousCommand === "Q" || previousCommand === "q" || previousCommand === "T" || previousCommand === "t") {
            const reflectedControlX = currentX * 2 - lastQuadraticControlX;
            const reflectedControlY = currentY * 2 - lastQuadraticControlY;
            includePoint(reflectedControlX, reflectedControlY);
          }
          lastQuadraticControlX = currentX;
          lastQuadraticControlY = currentY;
        } else {
          lastQuadraticControlX = currentX;
          lastQuadraticControlY = currentY;
        }
        break;
      }
      case "H":
      case "h": {
        const isRelative = command === "h";

        while (index < tokens.length && !isCommandToken(tokens[index])) {
          const nextX = readNumber();
          currentX = isRelative ? currentX + nextX : nextX;
          includePoint(currentX, currentY);
        }

        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      }
      case "V":
      case "v": {
        const isRelative = command === "v";

        while (index < tokens.length && !isCommandToken(tokens[index])) {
          const nextY = readNumber();
          currentY = isRelative ? currentY + nextY : nextY;
          includePoint(currentX, currentY);
        }

        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      }
      case "C":
      case "c": {
        const isRelative = command === "c";

        while (index + 5 < tokens.length && !isCommandToken(tokens[index])) {
          const x1 = readNumber();
          const y1 = readNumber();
          const x2 = readNumber();
          const y2 = readNumber();
          const nextX = readNumber();
          const nextY = readNumber();
          const control1X = isRelative ? currentX + x1 : x1;
          const control1Y = isRelative ? currentY + y1 : y1;
          const control2X = isRelative ? currentX + x2 : x2;
          const control2Y = isRelative ? currentY + y2 : y2;
          currentX = isRelative ? currentX + nextX : nextX;
          currentY = isRelative ? currentY + nextY : nextY;
          includePoint(control1X, control1Y);
          includePoint(control2X, control2Y);
          includePoint(currentX, currentY);
          lastCubicControlX = control2X;
          lastCubicControlY = control2Y;
        }

        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      }
      case "S":
      case "s": {
        const isRelative = command === "s";

        while (index + 3 < tokens.length && !isCommandToken(tokens[index])) {
          const x2 = readNumber();
          const y2 = readNumber();
          const nextX = readNumber();
          const nextY = readNumber();
          const reflectedControlX =
            previousCommand === "C" || previousCommand === "c" || previousCommand === "S" || previousCommand === "s"
              ? currentX * 2 - lastCubicControlX
              : currentX;
          const reflectedControlY =
            previousCommand === "C" || previousCommand === "c" || previousCommand === "S" || previousCommand === "s"
              ? currentY * 2 - lastCubicControlY
              : currentY;
          const control2X = isRelative ? currentX + x2 : x2;
          const control2Y = isRelative ? currentY + y2 : y2;
          currentX = isRelative ? currentX + nextX : nextX;
          currentY = isRelative ? currentY + nextY : nextY;
          includePoint(reflectedControlX, reflectedControlY);
          includePoint(control2X, control2Y);
          includePoint(currentX, currentY);
          lastCubicControlX = control2X;
          lastCubicControlY = control2Y;
        }

        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      }
      case "Q":
      case "q": {
        const isRelative = command === "q";

        while (index + 3 < tokens.length && !isCommandToken(tokens[index])) {
          const x1 = readNumber();
          const y1 = readNumber();
          const nextX = readNumber();
          const nextY = readNumber();
          const controlX = isRelative ? currentX + x1 : x1;
          const controlY = isRelative ? currentY + y1 : y1;
          currentX = isRelative ? currentX + nextX : nextX;
          currentY = isRelative ? currentY + nextY : nextY;
          includePoint(controlX, controlY);
          includePoint(currentX, currentY);
          lastQuadraticControlX = controlX;
          lastQuadraticControlY = controlY;
        }

        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        break;
      }
      case "A":
      case "a": {
        const isRelative = command === "a";

        while (index + 6 < tokens.length && !isCommandToken(tokens[index])) {
          const rx = readNumber();
          const ry = readNumber();
          readNumber();
          readNumber();
          readNumber();
          const nextX = readNumber();
          const nextY = readNumber();
          const endX = isRelative ? currentX + nextX : nextX;
          const endY = isRelative ? currentY + nextY : nextY;
          includePoint(currentX - rx, currentY - ry);
          includePoint(currentX + rx, currentY + ry);
          includePoint(endX - rx, endY - ry);
          includePoint(endX + rx, endY + ry);
          currentX = endX;
          currentY = endY;
        }

        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      }
      case "Z":
      case "z":
        currentX = startX;
        currentY = startY;
        includePoint(currentX, currentY);
        lastCubicControlX = currentX;
        lastCubicControlY = currentY;
        lastQuadraticControlX = currentX;
        lastQuadraticControlY = currentY;
        break;
      default:
        break;
    }

    previousCommand = command;
  }

  return bounds;
}

// JSDOM 给不出根 svg 的真实 bbox；这里改为按 Mermaid 渲染后的图元重新计算视口，避免导出图片被固定视口裁切。
function measureSvgContentBounds(svg: Element): SvgBBox | null {
  let bounds: BoundsAccumulator | null = null;

  const visitElement = (element: Element, offsetX: number, offsetY: number) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "style" || tagName === "defs" || tagName === "marker") {
      return;
    }

    const translation = parseTranslate(element.getAttribute("transform"));
    const currentOffsetX = offsetX + translation.x;
    const currentOffsetY = offsetY + translation.y;

    if (tagName === "rect") {
      const x = parseSvgNumber(element.getAttribute("x")) ?? 0;
      const y = parseSvgNumber(element.getAttribute("y")) ?? 0;
      const width = parseSvgNumber(element.getAttribute("width")) ?? 0;
      const height = parseSvgNumber(element.getAttribute("height")) ?? 0;
      bounds = expandRectBounds(bounds, currentOffsetX + x, currentOffsetY + y, width, height);
      return;
    }

    if (tagName === "circle") {
      const cx = parseSvgNumber(element.getAttribute("cx")) ?? 0;
      const cy = parseSvgNumber(element.getAttribute("cy")) ?? 0;
      const radius = parseSvgNumber(element.getAttribute("r")) ?? 0;
      bounds = expandRectBounds(bounds, currentOffsetX + cx - radius, currentOffsetY + cy - radius, radius * 2, radius * 2);
      return;
    }

    if (tagName === "ellipse") {
      const cx = parseSvgNumber(element.getAttribute("cx")) ?? 0;
      const cy = parseSvgNumber(element.getAttribute("cy")) ?? 0;
      const radiusX = parseSvgNumber(element.getAttribute("rx")) ?? 0;
      const radiusY = parseSvgNumber(element.getAttribute("ry")) ?? 0;
      bounds = expandRectBounds(
        bounds,
        currentOffsetX + cx - radiusX,
        currentOffsetY + cy - radiusY,
        radiusX * 2,
        radiusY * 2
      );
      return;
    }

    if (tagName === "line") {
      const x1 = parseSvgNumber(element.getAttribute("x1")) ?? 0;
      const y1 = parseSvgNumber(element.getAttribute("y1")) ?? 0;
      const x2 = parseSvgNumber(element.getAttribute("x2")) ?? 0;
      const y2 = parseSvgNumber(element.getAttribute("y2")) ?? 0;
      bounds = expandBounds(bounds, currentOffsetX + x1, currentOffsetY + y1);
      bounds = expandBounds(bounds, currentOffsetX + x2, currentOffsetY + y2);
      return;
    }

    if (tagName === "polygon" || tagName === "polyline") {
      for (const point of parsePoints(element.getAttribute("points") ?? "")) {
        bounds = expandBounds(bounds, currentOffsetX + point.x, currentOffsetY + point.y);
      }
      return;
    }

    if (tagName === "path") {
      const pathData = element.getAttribute("d");
      if (pathData) {
        bounds = measurePathBounds(pathData, currentOffsetX, currentOffsetY, bounds);
      }
      return;
    }

    if (tagName === "text") {
      bounds = measureTextElementBounds(element, currentOffsetX, currentOffsetY, bounds);
      return;
    }

    for (const childElement of Array.from(element.children)) {
      visitElement(childElement, currentOffsetX, currentOffsetY);
    }
  };

  visitElement(svg, 0, 0);

  const finalBounds = bounds as BoundsAccumulator | null;
  if (finalBounds === null) {
    return null;
  }

  return {
    x: finalBounds.minX,
    y: finalBounds.minY,
    width: Math.max(finalBounds.maxX - finalBounds.minX, 1),
    height: Math.max(finalBounds.maxY - finalBounds.minY, 1)
  };
}

function normalizeSvgRootSize(svg: string): string {
  const dom = new JSDOM(svg, {
    contentType: "image/svg+xml"
  });
  const rootSvg = dom.window.document.documentElement;
  const measuredBounds = measureSvgContentBounds(rootSvg);

  if (!measuredBounds) {
    return svg;
  }

  const width = measuredBounds.width + MERMAID_EXPORT_PADDING * 2;
  const height = measuredBounds.height + MERMAID_EXPORT_PADDING * 2;
  rootSvg.setAttribute(
    "viewBox",
    `${formatSvgNumber(measuredBounds.x - MERMAID_EXPORT_PADDING)} ${formatSvgNumber(measuredBounds.y - MERMAID_EXPORT_PADDING)} ${formatSvgNumber(width)} ${formatSvgNumber(height)}`
  );
  rootSvg.setAttribute("width", formatSvgNumber(width));
  rootSvg.setAttribute("height", formatSvgNumber(height));

  const style = rootSvg.getAttribute("style") ?? "";
  const normalizedStyle = style.replace(/max-width\s*:\s*[^;]+;?/gi, "").trim();
  if (normalizedStyle) {
    rootSvg.setAttribute("style", normalizedStyle);
  } else {
    rootSvg.removeAttribute("style");
  }

  return rootSvg.outerHTML;
}

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
      mermaid.initialize(mermaidExportConfig);
      return mermaid;
    });
  }

  return mermaidModulePromise;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMermaidSvg(svg: string): string {
  // 理想情况下静态导出配置不会再产出 foreignObject；这里仍保留 `<br>` 归一化，兼容其他图类型的边缘情况。
  const normalizedXml = svg.replace(/<br\s*>/g, "<br/>");
  return normalizeSvgRootSize(normalizedXml);
}

export async function renderMermaidSvgForExport(code: string): Promise<string> {
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error("Mermaid 图表内容为空");
  }

  const task = renderQueue.then(async () => {
    const mermaid = await loadMermaid();
    const { svg } = await mermaid.render(randomId("doclens-export-mermaid"), trimmedCode);
    return normalizeMermaidSvg(svg);
  });

  renderQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

export async function renderMermaidPngDataUrl(code: string): Promise<string> {
  const normalizedSvg = await renderMermaidSvgForExport(code);
  const pngBuffer = await sharp(Buffer.from(normalizedSvg)).png().toBuffer();
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}
