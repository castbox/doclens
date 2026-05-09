const DOCS_PATH_PREFIX = "docs";
const PR_PATH_PREFIX = "pr";

export function stripDocsPathPrefix(inputPath: string): string {
  if (inputPath === DOCS_PATH_PREFIX) {
    return "";
  }

  if (inputPath.startsWith(`${DOCS_PATH_PREFIX}/`)) {
    return inputPath.slice(DOCS_PATH_PREFIX.length + 1);
  }

  return inputPath;
}

export function formatRepositoryDocsPath(inputPath: string): string {
  const normalized = stripDocsPathPrefix(inputPath.replace(/\\/g, "/").trim()).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) {
    return DOCS_PATH_PREFIX;
  }

  return `${DOCS_PATH_PREFIX}/${normalized}`;
}

export function isPrDocsPath(inputPath: string): boolean {
  const normalized = stripDocsPathPrefix(inputPath.replace(/\\/g, "/").trim()).replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized === PR_PATH_PREFIX || normalized.startsWith(`${PR_PATH_PREFIX}/`);
}
