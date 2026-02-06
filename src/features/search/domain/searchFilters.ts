import type { SearchFileType } from "./types";

export function sanitizeFileType(rawType: string | undefined): SearchFileType {
  if (!rawType) {
    return "all";
  }

  if (rawType === "md" || rawType === "code" || rawType === "pdf" || rawType === "all") {
    return rawType;
  }

  return "all";
}

export function buildTypeGlobs(fileType: SearchFileType): string[] {
  if (fileType === "md") {
    return ["*.md", "*.markdown"];
  }

  if (fileType === "code") {
    return ["*.ts", "*.tsx", "*.js", "*.jsx", "*.json", "*.yaml", "*.yml", "*.sql", "*.sh", "*.css", "*.scss", "*.html"];
  }

  if (fileType === "pdf") {
    return ["*.pdf"];
  }

  return [];
}
