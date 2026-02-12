export type DocsNodeType = "file" | "directory";

export type NormalizeDocsRouteStateInput = {
  scopePath?: string;
  path?: string;
  scopeNodeType?: DocsNodeType | null;
  pathNodeType?: DocsNodeType | null;
};

export type NormalizeDocsRouteStateResult = {
  scopePath: string;
  path: string;
  changed: boolean;
};

function normalizeRoutePath(input: string | undefined): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }

  return normalized.split("/").filter(Boolean).join("/");
}

export function isPathWithinScope(path: string, scopePath: string): boolean {
  const normalizedPath = normalizeRoutePath(path);
  const normalizedScope = normalizeRoutePath(scopePath);
  if (!normalizedScope) {
    return true;
  }

  if (!normalizedPath) {
    return false;
  }

  return normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);
}

export function normalizeDocsRouteState(input: NormalizeDocsRouteStateInput): NormalizeDocsRouteStateResult {
  const initialScope = normalizeRoutePath(input.scopePath);
  const initialPath = normalizeRoutePath(input.path);

  let scopePath = initialScope;
  let path = initialPath;

  if (scopePath) {
    if (input.scopeNodeType === "file") {
      if (!path) {
        path = scopePath;
      }
      scopePath = "";
    } else if (input.scopeNodeType === null) {
      scopePath = "";
    }
  }

  if (path) {
    if (input.pathNodeType === "directory") {
      if (!scopePath) {
        scopePath = path;
      }
      path = "";
    } else if (input.pathNodeType === null) {
      path = "";
    }
  }

  if (scopePath && path && !isPathWithinScope(path, scopePath)) {
    path = "";
  }

  return {
    scopePath,
    path,
    changed: scopePath !== initialScope || path !== initialPath
  };
}
