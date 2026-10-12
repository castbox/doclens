import DOMPurify, { type WindowLike } from "dompurify";

type MermaidSvgSanitizeOptions = {
  preserveViewBoxSize?: boolean;
};

const SAFE_MERMAID_TAGS = ["foreignObject", "div", "span", "p", "br", "strong", "em", "b", "i", "style"];
const FORBIDDEN_MERMAID_TAGS = [
  "script",
  "iframe",
  "image",
  "img",
  "feImage",
  "object",
  "embed",
  "audio",
  "video",
  "a"
];
const URI_ATTRIBUTES = new Set(["href", "xlink:href", "src", "srcset", "poster", "background", "action", "formaction"]);
const SAFE_FRAGMENT_REFERENCE = /^#[A-Za-z_][\w:.-]*$/;
const MAX_NATURAL_DIMENSION = 12_000;
const hookedWindows = new WeakSet<object>();

function decodeCssEscapes(value: string): string {
  return value.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_match, hex: string | undefined, escaped: string | undefined) => {
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return "\uFFFD";
      }
      return String.fromCodePoint(codePoint);
    }
    return escaped ?? "";
  });
}

function sanitizeCss(value: string): string | null {
  const canonical = decodeCssEscapes(value).replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutImports = canonical.replace(/@import\b[^;]*(?:;|$)/gi, "");
  const withoutExternalUrls = withoutImports.replace(
    /url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)/gi,
    (_match, _quote: string | undefined, quoted: string | undefined, unquoted: string | undefined) => {
      const reference = (quoted ?? unquoted ?? "").trim();
      return SAFE_FRAGMENT_REFERENCE.test(reference) ? `url(${reference})` : "none";
    }
  );

  if (/(?:https?|ftp|data|blob|file|javascript|vbscript):|\/\/[\w.-]|image-set\s*\(|cross-fade\s*\(|expression\s*\(|(?:^|[;{])\s*(?:behavior|-moz-binding)\s*:/i.test(
    withoutExternalUrls
  )) {
    return null;
  }

  return withoutExternalUrls;
}

function applyNaturalViewBoxSize(svg: Element): void {
  const values = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);

  if (!values || values.length !== 4 || !values.every(Number.isFinite)) {
    return;
  }

  const [, , rawWidth, rawHeight] = values;
  if (rawWidth <= 0 || rawHeight <= 0) {
    return;
  }

  const scale = Math.min(1, MAX_NATURAL_DIMENSION / rawWidth, MAX_NATURAL_DIMENSION / rawHeight);
  const width = Math.max(1, Math.ceil(rawWidth * scale));
  const height = Math.max(1, Math.ceil(rawHeight * scale));
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") || "xMidYMid meet");
}

function getPurifier(targetWindow: WindowLike) {
  const purifier = DOMPurify(targetWindow);
  if (hookedWindows.has(targetWindow)) {
    return purifier;
  }

  hookedWindows.add(targetWindow);
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    const attributeName = data.attrName.toLowerCase();

    if (URI_ATTRIBUTES.has(attributeName)) {
      if (
        (attributeName === "href" || attributeName === "xlink:href") &&
        SAFE_FRAGMENT_REFERENCE.test(data.attrValue.trim())
      ) {
        return;
      }
      data.keepAttr = false;
      return;
    }

    const canonicalValue = decodeCssEscapes(data.attrValue);
    if (attributeName === "style" || /url\s*\(|@import/i.test(canonicalValue)) {
      const safeCss = sanitizeCss(data.attrValue);
      if (safeCss === null) {
        data.keepAttr = false;
      } else {
        data.attrValue = safeCss;
      }
    }
  });
  purifier.addHook("uponSanitizeElement", (node, event) => {
    if (event.tagName.toLowerCase() !== "style") {
      return;
    }

    const safeCss = sanitizeCss(node.textContent ?? "");
    if (safeCss === null) {
      node.parentNode?.removeChild(node);
    } else {
      node.textContent = safeCss;
    }
  });

  return purifier;
}

/** Sanitizes Mermaid output before it enters the chat DOM. */
export function sanitizeMermaidSvg(
  markup: string,
  domWindow?: WindowLike,
  options: MermaidSvgSanitizeOptions = {}
): string {
  const targetWindow = domWindow ?? (typeof window === "undefined" ? undefined : window);
  if (!targetWindow) {
    throw new Error("Mermaid SVG 安全校验需要浏览器环境");
  }

  const fragment = getPurifier(targetWindow).sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: SAFE_MERMAID_TAGS,
    FORBID_TAGS: FORBIDDEN_MERMAID_TAGS,
    FORBID_ATTR: ["src", "srcset", "poster", "background", "action", "formaction"],
    ALLOW_DATA_ATTR: false,
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    RETURN_DOM_FRAGMENT: true
  });
  const svg = fragment.querySelector("svg");

  if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg") {
    throw new Error("Mermaid SVG 未通过安全校验");
  }

  if (options.preserveViewBoxSize) {
    applyNaturalViewBoxSize(svg);
  }

  return svg.outerHTML;
}
