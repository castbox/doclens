import fs from "node:fs";
import path from "node:path";
import { readDocsRootBinding } from "./docsRootBinding";

const DEFAULT_DOCS_ROOT = "./docs";
const DEFAULT_DB_PATH = "./data/doclens.sqlite";
const DEFAULT_SEARCH_PROVIDER = "rg";
const DEFAULT_SEARCH_IGNORE = ["third_parties", "node_modules", ".git", ".next", ".turbo", "dist", "build", "coverage"];
const DEFAULT_MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_PREVIEW_LINES = 500;

type Config = {
  configuredDocsRoot: string;
  docsRoot: string;
  docsRootMode: "docs-directory" | "project-root";
  dbPath: string;
  searchProvider: string;
  searchIgnore: string[];
  maxPreviewBytes: number;
  maxPreviewLines: number;
};

let cachedConfig: Config | null = null;
let cachedConfigValidatedAt = 0;
const CONFIG_REVALIDATE_MS = 1000;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDirectory(candidatePath: string): boolean {
  try {
    return fs.statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

function resolveDocsRoot(rawDocsRoot: string): Pick<Config, "configuredDocsRoot" | "docsRoot" | "docsRootMode"> {
  const configuredDocsRoot = path.resolve(process.cwd(), rawDocsRoot);
  const nestedDocsRoot = path.resolve(configuredDocsRoot, "docs");

  if (path.basename(configuredDocsRoot) !== "docs" && isDirectory(nestedDocsRoot)) {
    return {
      configuredDocsRoot,
      docsRoot: configuredDocsRoot,
      docsRootMode: "project-root"
    };
  }

  return {
    configuredDocsRoot,
    docsRoot: configuredDocsRoot,
    docsRootMode: "docs-directory"
  };
}

export function getConfig(): Config {
  if (cachedConfig && Date.now() - cachedConfigValidatedAt < CONFIG_REVALIDATE_MS) {
    return cachedConfig;
  }

  const dbPath = path.resolve(process.cwd(), process.env.DOCLENS_DB_PATH ?? DEFAULT_DB_PATH);
  const boundDocsRoot = readDocsRootBinding(dbPath);
  const docsRootConfig = resolveDocsRoot(boundDocsRoot ?? process.env.DOCLENS_DOCS_ROOT ?? DEFAULT_DOCS_ROOT);
  const searchProvider = (process.env.DOCLENS_SEARCH_PROVIDER ?? DEFAULT_SEARCH_PROVIDER).toLowerCase();
  const searchIgnore = (process.env.DOCLENS_SEARCH_IGNORE ?? DEFAULT_SEARCH_IGNORE.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  cachedConfig = {
    ...docsRootConfig,
    dbPath,
    searchProvider,
    searchIgnore,
    maxPreviewBytes: parseNumber(process.env.DOCLENS_MAX_FILE_PREVIEW_BYTES, DEFAULT_MAX_PREVIEW_BYTES),
    maxPreviewLines: parseNumber(process.env.DOCLENS_MAX_FILE_PREVIEW_LINES, DEFAULT_MAX_PREVIEW_LINES)
  };
  cachedConfigValidatedAt = Date.now();

  return cachedConfig;
}

export function clearConfigCache(): void {
  cachedConfig = null;
  cachedConfigValidatedAt = 0;
}
