import path from "node:path";
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

  if (safePath === ".." || safePath.startsWith("../")) {
    throw new PathSecurityError("Path traversal is not allowed");
  }

  return safePath;
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

export function resolveDocsPath(inputPath = ""): { docsRoot: string; relativePath: string; absolutePath: string } {
  const { docsRoot } = getConfig();
  const relativePath = normalizeInput(inputPath);
  const absolutePath = path.resolve(docsRoot, relativePath);

  ensureWithinRoot(docsRoot, absolutePath);

  return {
    docsRoot,
    relativePath,
    absolutePath
  };
}
