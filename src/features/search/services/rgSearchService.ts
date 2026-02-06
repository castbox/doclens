import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { parseSearchTerms } from "@/features/search/domain/queryParser";
import { parseRgJsonOutput } from "@/features/search/domain/rgParser";
import { buildTypeGlobs, sanitizeFileType } from "@/features/search/domain/searchFilters";
import { highlightSnippet } from "@/features/search/domain/resultHighlighter";
import type { SearchRequest, SearchResult } from "@/features/search/domain/types";
import { getConfig } from "@/shared/utils/env";
import { getCachedSearch, setCachedSearch } from "./searchCacheService";

const execFileAsync = promisify(execFile);

type InternalHit = {
  path: string;
  line: number;
  column: number;
  snippet: string;
};

function buildCacheKey(request: Required<Omit<SearchRequest, "scope">> & { scope: string }): string {
  return JSON.stringify(request);
}

function buildRgArgs(term: string, request: { scope: string; type: string }): string[] {
  const { searchIgnore } = getConfig();
  const args = ["--json", "--line-number", "--column", "--smart-case", "--hidden"];

  for (const ignored of searchIgnore) {
    args.push("--glob", `!**/${ignored}/**`);
  }

  const globs = buildTypeGlobs(sanitizeFileType(request.type));
  for (const glob of globs) {
    args.push("--glob", glob);
  }

  args.push(term);

  const scopePath = request.scope ? resolveDocsPath(request.scope).absolutePath : getConfig().docsRoot;
  args.push(scopePath);

  return args;
}

async function runSingleTermSearch(term: string, request: { scope: string; type: string }): Promise<InternalHit[]> {
  const { docsRoot } = getConfig();

  try {
    const { stdout } = await execFileAsync("rg", buildRgArgs(term, request), {
      maxBuffer: 50 * 1024 * 1024
    });

    return parseRgJsonOutput(stdout, docsRoot);
  } catch (error) {
    const maybeError = error as { code?: number; stdout?: string };

    if (maybeError.code === 1 && maybeError.stdout !== undefined) {
      return parseRgJsonOutput(maybeError.stdout, docsRoot);
    }

    throw error;
  }
}

async function sortHits(hits: InternalHit[], sort: "relevance" | "mtime"): Promise<InternalHit[]> {
  if (sort === "relevance") {
    return hits;
  }

  const { docsRoot } = getConfig();
  const mtimeByPath = new Map<string, number>();

  await Promise.all(
    Array.from(new Set(hits.map((hit) => hit.path))).map(async (relativePath) => {
      const stats = await fs.stat(path.resolve(docsRoot, relativePath));
      mtimeByPath.set(relativePath, stats.mtimeMs);
    })
  );

  return hits.slice().sort((a, b) => {
    const mtimeDiff = (mtimeByPath.get(b.path) ?? 0) - (mtimeByPath.get(a.path) ?? 0);
    if (mtimeDiff !== 0) {
      return mtimeDiff;
    }

    return a.path.localeCompare(b.path);
  });
}

export async function searchDocs(input: SearchRequest): Promise<SearchResult> {
  const startedAt = Date.now();
  const terms = parseSearchTerms(input.q);
  const page = input.page && input.page > 0 ? input.page : 1;
  const size = input.size && input.size > 0 ? input.size : 20;
  const type = sanitizeFileType(input.type);
  const scope = input.scope?.trim() ?? "";
  const sort = input.sort === "mtime" ? "mtime" : "relevance";

  const cacheKey = buildCacheKey({ q: input.q.trim(), scope, type, page, size, sort });
  const cached = getCachedSearch(cacheKey);
  if (cached) {
    return cached;
  }

  if (terms.length === 0) {
    return {
      query: input.q,
      total: 0,
      page,
      size,
      tookMs: 0,
      hits: []
    };
  }

  const allTermHits = await Promise.all(
    terms.map((term) => runSingleTermSearch(term, { scope, type }))
  );

  let baseHits = allTermHits[0] ?? [];

  for (let index = 1; index < allTermHits.length; index += 1) {
    const termPaths = new Set((allTermHits[index] ?? []).map((hit) => hit.path));
    baseHits = baseHits.filter((hit) => termPaths.has(hit.path));
  }

  const dedupedHitsMap = new Map<string, InternalHit>();
  for (const hit of baseHits) {
    const key = `${hit.path}:${hit.line}:${hit.column}`;
    if (!dedupedHitsMap.has(key)) {
      dedupedHitsMap.set(key, hit);
    }
  }

  const sortedHits = await sortHits(Array.from(dedupedHitsMap.values()), sort);
  const offset = (page - 1) * size;
  const pagedHits = sortedHits.slice(offset, offset + size);

  const result: SearchResult = {
    query: input.q,
    total: sortedHits.length,
    page,
    size,
    tookMs: Date.now() - startedAt,
    hits: pagedHits.map((hit) => ({
      ...hit,
      highlightedSnippet: highlightSnippet(hit.snippet, terms)
    }))
  };

  setCachedSearch(cacheKey, result);
  return result;
}
