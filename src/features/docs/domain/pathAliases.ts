const DOCS_PATH_PREFIX = "docs";
const PR_PATH_PREFIX = "pr";
type DocsRootMode = "docs-directory" | "project-root";

function normalizeBasicPath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/").trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function stripDocsPathPrefix(inputPath: string, mode: DocsRootMode = "docs-directory"): string {
  if (mode === "project-root") {
    return inputPath;
  }

  if (inputPath === DOCS_PATH_PREFIX) {
    return "";
  }

  if (inputPath.startsWith(`${DOCS_PATH_PREFIX}/`)) {
    return inputPath.slice(DOCS_PATH_PREFIX.length + 1);
  }

  return inputPath;
}

export function formatRepositoryDocsPath(inputPath: string, mode: DocsRootMode = "docs-directory"): string {
  const normalized = stripDocsPathPrefix(normalizeBasicPath(inputPath), mode);
  if (mode === "project-root") {
    return normalized || ".";
  }

  if (!normalized) {
    return DOCS_PATH_PREFIX;
  }

  return `${DOCS_PATH_PREFIX}/${normalized}`;
}

export function isPrDocsPath(inputPath: string): boolean {
  const normalized = normalizeBasicPath(inputPath);
  return (
    normalized === PR_PATH_PREFIX ||
    normalized.startsWith(`${PR_PATH_PREFIX}/`) ||
    normalized === `${DOCS_PATH_PREFIX}/${PR_PATH_PREFIX}` ||
    normalized.startsWith(`${DOCS_PATH_PREFIX}/${PR_PATH_PREFIX}/`)
  );
}

export function getPrDocsPathPrefix(mode: DocsRootMode): string {
  return mode === "project-root" ? `${DOCS_PATH_PREFIX}/${PR_PATH_PREFIX}` : PR_PATH_PREFIX;
}
