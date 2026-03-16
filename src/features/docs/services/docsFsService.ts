import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { detectPreviewKind } from "@/features/docs/domain/fileType";
import { extractMarkdownHeadings } from "@/features/docs/domain/markdownHeading";
import { autoLinkDocsMarkdownPaths, preserveDiffSectionLineBreaks } from "@/features/docs/domain/markdownPreviewTransform";
import type { FilePreviewPayload, PathMetaPayload, TreeNode } from "@/features/docs/domain/types";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { LRUCache } from "@/shared/domain/lru";
import { getConfig } from "@/shared/utils/env";

type ReadFilePreviewOptions = {
  fullContent?: boolean;
};

type PreviewCacheEntry = {
  version: string;
  payload: FilePreviewPayload;
};

const docsPreviewCache = new LRUCache<string, PreviewCacheEntry>(120);

function shouldIgnoreName(name: string): boolean {
  const { searchIgnore } = getConfig();
  if (name.startsWith(".")) {
    return true;
  }

  return searchIgnore.includes(name);
}

function toPosixPath(inputPath: string): string {
  return inputPath.split(path.sep).join(path.posix.sep);
}

export async function listTreeNodes(inputPath = ""): Promise<TreeNode[]> {
  const { absolutePath, relativePath } = resolveDocsPath(inputPath);
  const stats = await fs.stat(absolutePath);

  if (!stats.isDirectory()) {
    throw new Error("Path is not a directory");
  }

  const entries = await fs.readdir(absolutePath, { withFileTypes: true });

  const nodes = await Promise.all(
    entries
      .filter((entry) => !shouldIgnoreName(entry.name))
      .map(async (entry) => {
        const nodePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          const fullPath = path.resolve(absolutePath, entry.name);
          const children = await fs.readdir(fullPath, { withFileTypes: true });
          const hasChildren = children.some((child) => !shouldIgnoreName(child.name));
          return {
            name: entry.name,
            path: toPosixPath(nodePath),
            type: "directory" as const,
            hasChildren
          };
        }

        return {
          name: entry.name,
          path: toPosixPath(nodePath),
          type: "file" as const
        };
      })
  );

  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }

    return a.name.localeCompare(b.name, "zh-CN");
  });
}

function truncateByLines(content: string, maxLines: number): { content: string; truncated: boolean; truncatedLines: number } {
  const lines = content.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return {
      content,
      truncated: false,
      truncatedLines: 0
    };
  }

  return {
    content: lines.slice(0, maxLines).join("\n"),
    truncated: true,
    truncatedLines: lines.length - maxLines
  };
}

function buildPreviewCacheKey(absolutePath: string, fullContent: boolean): string {
  return `${absolutePath}::${fullContent ? "full" : "preview"}`;
}

function buildPreviewVersion(stats: Awaited<ReturnType<typeof fs.stat>>, fullContent: boolean): string {
  return `${stats.mtimeMs}:${stats.size}:${fullContent ? 1 : 0}`;
}

function buildMarkdownPreview(content: string): NonNullable<FilePreviewPayload["markdown"]> {
  const renderedContent = autoLinkDocsMarkdownPaths(preserveDiffSectionLineBreaks(content));
  return {
    renderedContent,
    headings: extractMarkdownHeadings(renderedContent)
  };
}

function cachePreview(cacheKey: string, version: string, payload: FilePreviewPayload): FilePreviewPayload {
  docsPreviewCache.set(cacheKey, {
    version,
    payload
  });
  return payload;
}

export async function readFilePreview(inputPath: string, options: ReadFilePreviewOptions = {}): Promise<FilePreviewPayload> {
  const { absolutePath, relativePath } = resolveDocsPath(inputPath);
  const { maxPreviewBytes, maxPreviewLines } = getConfig();
  const stats = await fs.stat(absolutePath);
  const fullContent = options.fullContent === true;

  if (!stats.isFile()) {
    throw new Error("Path is not a file");
  }

  const name = path.basename(absolutePath);
  const kind = detectPreviewKind(name);
  const size = stats.size;
  const cacheKey = buildPreviewCacheKey(absolutePath, fullContent);
  const version = buildPreviewVersion(stats, fullContent);
  const cached = docsPreviewCache.get(cacheKey);
  if (cached && cached.version === version) {
    return cached.payload;
  }

  if (kind === "pdf" || kind === "binary") {
    return cachePreview(cacheKey, version, {
      path: relativePath,
      name,
      kind,
      size,
      modifiedAt: stats.mtime.toISOString(),
      truncated: false,
      truncatedLines: 0,
      content: ""
    });
  }

  let rawContent: string;

  rawContent = await fs.readFile(absolutePath, { encoding: "utf8" });
  if (fullContent) {
    return cachePreview(cacheKey, version, {
      path: relativePath,
      name,
      kind,
      size,
      modifiedAt: stats.mtime.toISOString(),
      truncated: false,
      truncatedLines: 0,
      content: rawContent,
      markdown: kind === "markdown" ? buildMarkdownPreview(rawContent) : undefined
    });
  }

  if (size > maxPreviewBytes) {
    const truncated = truncateByLines(rawContent, maxPreviewLines);
    return cachePreview(cacheKey, version, {
      path: relativePath,
      name,
      kind,
      size,
      modifiedAt: stats.mtime.toISOString(),
      truncated: true,
      truncatedLines: truncated.truncatedLines,
      content: truncated.content,
      markdown: kind === "markdown" ? buildMarkdownPreview(truncated.content) : undefined
    });
  }

  const lineTruncated = truncateByLines(rawContent, maxPreviewLines);

  return cachePreview(cacheKey, version, {
    path: relativePath,
    name,
    kind,
    size,
    modifiedAt: stats.mtime.toISOString(),
    truncated: lineTruncated.truncated,
    truncatedLines: lineTruncated.truncatedLines,
    content: lineTruncated.content,
    markdown: kind === "markdown" ? buildMarkdownPreview(lineTruncated.content) : undefined
  });
}

export async function readRawFile(inputPath: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; fileName: string }> {
  const { absolutePath } = resolveDocsPath(inputPath);
  const stats = await fs.stat(absolutePath);

  if (!stats.isFile()) {
    throw new Error("Path is not a file");
  }

  const fileName = path.basename(absolutePath);
  const kind = detectPreviewKind(fileName);
  const contentType =
    kind === "pdf"
      ? "application/pdf"
      : kind === "markdown"
        ? "text/markdown; charset=utf-8"
        : kind === "code" || kind === "text"
          ? "text/plain; charset=utf-8"
          : "application/octet-stream";

  const nodeStream = createReadStream(absolutePath);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: string | Uint8Array) => {
        if (typeof chunk === "string") {
          controller.enqueue(new TextEncoder().encode(chunk));
          return;
        }

        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (error) => controller.error(error));
    },
    cancel() {
      nodeStream.destroy();
    }
  });

  return { stream, contentType, fileName };
}

export async function readFileMeta(inputPath: string): Promise<{ path: string; size: number; modifiedAt: string; kind: string }> {
  const { absolutePath, relativePath } = resolveDocsPath(inputPath);
  const stats = await fs.stat(absolutePath);

  if (!stats.isFile()) {
    throw new Error("Path is not a file");
  }

  return {
    path: relativePath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    kind: detectPreviewKind(path.basename(absolutePath))
  };
}

export async function readPathMeta(inputPath: string): Promise<PathMetaPayload> {
  const { absolutePath, relativePath } = resolveDocsPath(inputPath);
  const stats = await fs.stat(absolutePath);

  if (stats.isDirectory()) {
    return {
      path: relativePath,
      nodeType: "directory",
      modifiedAt: stats.mtime.toISOString()
    };
  }

  if (!stats.isFile()) {
    throw new Error("Path is not a file or directory");
  }

  return {
    path: relativePath,
    nodeType: "file",
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    kind: detectPreviewKind(path.basename(absolutePath))
  };
}
