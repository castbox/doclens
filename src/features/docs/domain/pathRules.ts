import path from "node:path";
import { formatRepositoryDocsPath, stripDocsPathPrefix } from "@/features/docs/domain/pathAliases";
import { getConfig } from "@/shared/utils/env";

export class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

function normalizeInput(inputPath: string): string {
  if (inputPath.includes("\0")) {
    throw new PathSecurityError("Invalid path characters");
  }

  const normalized = inputPath.replace(/\\/g, "/").trim();
  if (!normalized || normalized === ".") {
    return "";
  }

  if (normalized.startsWith("/")) {
    throw new PathSecurityError("Absolute path is not allowed");
  }

  const safePath = path.posix.normalize(normalized);

  if (safePath === ".") {
    return "";
  }

  if (safePath === ".." || safePath.startsWith("../")) {
    throw new PathSecurityError("Path traversal is not allowed");
  }

  return safePath;
}

export function normalizeDocsInputPath(inputPath = ""): string {
  const { docsRootMode } = getConfig();
  return stripDocsPathPrefix(normalizeInput(inputPath), docsRootMode);
}

function ensureWithinRoot(root: string, target: string): void {
  if (target === root) {
    return;
  }

  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathSecurityError("Resolved path escapes docs root");
  }
}

function ensureNotIgnored(relativePath: string, ignoredNames: string[]): void {
  if (!relativePath) {
    return;
  }

  const ignored = new Set(ignoredNames);
  const blockedSegment = relativePath.split("/").find((segment) => ignored.has(segment));
  if (blockedSegment) {
    throw new PathSecurityError(`Path is ignored: ${blockedSegment}`);
  }
}

export function resolveDocsPath(inputPath = ""): { docsRoot: string; relativePath: string; repositoryPath: string; absolutePath: string } {
  const { docsRoot, docsRootMode, searchIgnore } = getConfig();
  const relativePath = normalizeDocsInputPath(inputPath);
  const absolutePath = path.resolve(docsRoot, relativePath);

  ensureWithinRoot(docsRoot, absolutePath);
  ensureNotIgnored(relativePath, searchIgnore);

  return {
    docsRoot,
    relativePath,
    repositoryPath: formatRepositoryDocsPath(relativePath, docsRootMode),
    absolutePath
  };
}
