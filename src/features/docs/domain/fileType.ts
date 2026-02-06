export type PreviewKind = "markdown" | "pdf" | "code" | "text" | "binary";

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".yaml",
  ".yml",
  ".sql",
  ".sh",
  ".css",
  ".scss",
  ".html",
  ".mdx"
]);

const TEXT_EXTENSIONS = new Set([".txt", ".log", ".env", ".ini", ".conf", ".csv"]);

export function detectPreviewKind(fileName: string): PreviewKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "markdown";
  }

  if (lower.endsWith(".pdf")) {
    return "pdf";
  }

  const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";

  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }

  return "binary";
}
