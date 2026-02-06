import path from "node:path";

const DEFAULT_DOCS_ROOT = "./docs";
const DEFAULT_DB_PATH = "./data/doclens.sqlite";
const DEFAULT_SEARCH_PROVIDER = "rg";
const DEFAULT_SEARCH_IGNORE = ["third_parties", "node_modules", ".git"];
const DEFAULT_MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_PREVIEW_LINES = 500;

type Config = {
  docsRoot: string;
  dbPath: string;
  searchProvider: string;
  searchIgnore: string[];
  maxPreviewBytes: number;
  maxPreviewLines: number;
};

let cachedConfig: Config | null = null;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const docsRoot = path.resolve(process.cwd(), process.env.DOCLENS_DOCS_ROOT ?? DEFAULT_DOCS_ROOT);
  const dbPath = path.resolve(process.cwd(), process.env.DOCLENS_DB_PATH ?? DEFAULT_DB_PATH);
  const searchProvider = (process.env.DOCLENS_SEARCH_PROVIDER ?? DEFAULT_SEARCH_PROVIDER).toLowerCase();
  const searchIgnore = (process.env.DOCLENS_SEARCH_IGNORE ?? DEFAULT_SEARCH_IGNORE.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  cachedConfig = {
    docsRoot,
    dbPath,
    searchProvider,
    searchIgnore,
    maxPreviewBytes: parseNumber(process.env.DOCLENS_MAX_FILE_PREVIEW_BYTES, DEFAULT_MAX_PREVIEW_BYTES),
    maxPreviewLines: parseNumber(process.env.DOCLENS_MAX_FILE_PREVIEW_LINES, DEFAULT_MAX_PREVIEW_LINES)
  };

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
