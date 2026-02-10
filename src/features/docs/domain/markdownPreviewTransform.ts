const DOC_MARKDOWN_PATH_PATTERN = /(?:docs\/|\/|\.\.\/|\.\/)[^\s)\]`]+?\.md(?:#[^\s)\]`]+)?/g;

type TextRange = {
  start: number;
  end: number;
};

function collectProtectedRanges(line: string): TextRange[] {
  const ranges: TextRange[] = [];
  const patterns = [/`[^`]*`/g, /\[[^\]]*]\([^)]+\)/g];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(line);
    while (match) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length
      });
      match = pattern.exec(line);
    }
  }

  return ranges;
}

function isOffsetInRanges(offset: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function detectDiffSectionTitle(line: string): "diff-self-check" | "diff-range" | null {
  const trimmed = line.trim();
  const headingMatch = /^\s*#{1,6}\s*(.+?)\s*$/.exec(trimmed);
  const text = (headingMatch?.[1] ?? trimmed).replace(/\s+/g, " ").trim();

  if (/^关键\s*Diff\s*[（(]自检[）)]$/i.test(text)) {
    return "diff-self-check";
  }

  if (/^Diff\s*\(spike\/fullstack\.\.\.HEAD\)$/i.test(text)) {
    return "diff-range";
  }

  return null;
}

export function preserveDiffSectionLineBreaks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let inDiffSection = false;
  let inFence = false;
  let currentFenceMarker = "";

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        currentFenceMarker = marker;
      } else if (marker === currentFenceMarker) {
        inFence = false;
        currentFenceMarker = "";
      }
      output.push(line);
      continue;
    }

    if (!inFence) {
      if (/^\s*#{1,6}\s+/.test(line)) {
        inDiffSection = detectDiffSectionTitle(line) !== null;
        output.push(line);
        continue;
      }

      const lineTitle = detectDiffSectionTitle(line);
      if (lineTitle !== null) {
        inDiffSection = true;
        output.push(line);
        continue;
      }
    }

    if (!inDiffSection || inFence) {
      output.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      output.push(line);
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line) || /^\s*>/.test(line) || /^\s*\|/.test(line)) {
      output.push(line);
      continue;
    }

    if (/\s{2,}$/.test(line) || /<br\s*\/?>\s*$/i.test(line)) {
      output.push(line);
      continue;
    }

    output.push(`${line}  `);
  }

  return output.join("\n");
}

export function autoLinkDocsMarkdownPaths(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let currentFenceMarker = "";

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!inFence) {
          inFence = true;
          currentFenceMarker = marker;
        } else if (marker === currentFenceMarker) {
          inFence = false;
          currentFenceMarker = "";
        }
        return line;
      }

      if (inFence) {
        return line;
      }

      const protectedRanges = collectProtectedRanges(line);

      return line.replace(DOC_MARKDOWN_PATH_PATTERN, (matched, offset, source) => {
        const start = Number(offset);
        if (isOffsetInRanges(start, protectedRanges)) {
          return matched;
        }

        const prefix = source.slice(Math.max(0, start - 2), start);
        if (prefix === "](") {
          return matched;
        }

        return `[${matched}](${matched})`;
      });
    })
    .join("\n");
}

export function normalizeDocsRelativePath(inputPath: string): string | null {
  const normalized = inputPath.replace(/\\/g, "/");
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

export function resolveMarkdownDocPath(href: string | undefined, currentPath: string): string | null {
  if (!href) {
    return null;
  }

  const decodedHref = decodeURIComponent(href).trim();
  if (!decodedHref || decodedHref.startsWith("#")) {
    return null;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decodedHref)) {
    return null;
  }

  const pathOnly = decodedHref.split("#")[0].split("?")[0];
  if (!pathOnly.toLowerCase().endsWith(".md")) {
    return null;
  }

  if (pathOnly.startsWith("docs/")) {
    return normalizeDocsRelativePath(pathOnly.slice("docs/".length));
  }

  if (pathOnly.startsWith("/")) {
    return normalizeDocsRelativePath(pathOnly.slice(1));
  }

  const currentDir = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
  const merged = currentDir ? `${currentDir}/${pathOnly}` : pathOnly;
  return normalizeDocsRelativePath(merged);
}

export function buildAnchorHash(href: string | undefined): string {
  if (!href || !href.includes("#")) {
    return "";
  }

  const raw = href.slice(href.indexOf("#") + 1).trim();
  if (!raw) {
    return "";
  }

  return decodeURIComponent(raw);
}
