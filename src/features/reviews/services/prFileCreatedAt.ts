import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";
import { LRUCache } from "@/shared/domain/lru";
import { getConfig } from "@/shared/utils/env";

const execFileAsync = promisify(execFile);
const FRONTMATTER_PROBE_BYTES = 64 * 1024;
const GIT_BATCH_MARKER = "__DOCLENS_GIT_CREATED_AT__";
const frontmatterCreatedAtCache = new LRUCache<string, Date | null>(512);
const gitCreatedAtByHeadCache = new Map<string, Promise<Map<string, Date> | null>>();
const gitFollowCreatedAtCache = new LRUCache<string, Date>(2048);

type FileStats = Awaited<ReturnType<typeof fs.stat>>;

function buildFrontmatterCacheKey(absolutePath: string, stats: FileStats): string {
  return `${absolutePath}:${stats.mtimeMs}:${stats.size}`;
}

function normalizeFrontmatterProbe(content: string): string {
  return content.startsWith("\uFEFF") ? content.slice(1) : content;
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number") {
    const milliseconds = value > 1e12 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function hasClosedFrontmatter(snippet: string): boolean {
  if (!snippet.startsWith("---")) {
    return false;
  }

  return /\r?\n---(?:\r?\n|$)/.test(snippet.slice(3)) || /\r?\n\.\.\.(?:\r?\n|$)/.test(snippet.slice(3));
}

async function readFrontmatterProbe(absolutePath: string, size: number): Promise<string> {
  const handle = await fs.open(absolutePath, "r");

  try {
    const buffer = Buffer.alloc(Math.min(size, FRONTMATTER_PROBE_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return normalizeFrontmatterProbe(buffer.toString("utf8", 0, bytesRead));
  } finally {
    await handle.close();
  }
}

async function readFrontmatterCreatedAt(absolutePath: string, stats: FileStats): Promise<Date | null> {
  if (path.extname(absolutePath).toLowerCase() !== ".md") {
    return null;
  }

  const cacheKey = buildFrontmatterCacheKey(absolutePath, stats);
  const cached = frontmatterCreatedAtCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let probe = await readFrontmatterProbe(absolutePath, Number(stats.size));
  if (!probe.startsWith("---")) {
    frontmatterCreatedAtCache.set(cacheKey, null);
    return null;
  }

  if (!hasClosedFrontmatter(probe) && stats.size > Buffer.byteLength(probe, "utf8")) {
    probe = normalizeFrontmatterProbe(await fs.readFile(absolutePath, "utf8"));
  }

  const parsed = matter(probe);
  const createdAt = parseDateValue(parsed.data.created_at);
  frontmatterCreatedAtCache.set(cacheKey, createdAt);
  return createdAt;
}

export function parseCreatedAtFromFileName(fileName: string): Date | null {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const compactMatch = /^(\d{4})(\d{2})(\d{2})(?:[-_]|$)/.exec(baseName);
  if (compactMatch) {
    const year = Number.parseInt(compactMatch[1], 10);
    const month = Number.parseInt(compactMatch[2], 10);
    const day = Number.parseInt(compactMatch[3], 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed;
    }
  }

  const dashedMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[-_]|$)/.exec(baseName);
  if (!dashedMatch) {
    return null;
  }

  const year = Number.parseInt(dashedMatch[1], 10);
  const month = Number.parseInt(dashedMatch[2], 10);
  const day = Number.parseInt(dashedMatch[3], 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  ) {
    return parsed;
  }

  return null;
}

async function resolveGitHead(docsRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", docsRoot, "rev-parse", "HEAD"], {
      timeout: 10000,
      maxBuffer: 1024 * 1024
    });
    const head = stdout.trim();
    return head || null;
  } catch {
    return null;
  }
}

async function buildGitCreatedAtIndex(docsRoot: string, head: string): Promise<Map<string, Date> | null> {
  const cacheKey = `${docsRoot}:${head}`;
  const cached = gitCreatedAtByHeadCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", docsRoot, "log", "--reverse", "--diff-filter=A", `--format=${GIT_BATCH_MARKER}%cI`, "--name-only", "--relative", "--", "pr"],
        {
          timeout: 20000,
          maxBuffer: 16 * 1024 * 1024
        }
      );

      const createdAtByPath = new Map<string, Date>();
      let activeDate: Date | null = null;

      for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        if (line.startsWith(GIT_BATCH_MARKER)) {
          activeDate = parseDateValue(line.slice(GIT_BATCH_MARKER.length));
          continue;
        }

        if (!activeDate || !line.startsWith("pr/") || path.posix.extname(line).toLowerCase() !== ".md") {
          continue;
        }

        if (!createdAtByPath.has(line)) {
          createdAtByPath.set(line, activeDate);
        }
      }

      return createdAtByPath;
    } catch {
      return null;
    }
  })();

  gitCreatedAtByHeadCache.set(cacheKey, promise);
  return promise;
}

async function readGitCreatedAtWithFollow(docsRoot: string, head: string, relativePath: string): Promise<Date | null> {
  const cacheKey = `${docsRoot}:${head}:${relativePath}`;
  const cached = gitFollowCreatedAtCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", docsRoot, "log", "--reverse", "--follow", "--diff-filter=A", "--format=%cI", "--relative", "--", relativePath],
      {
        timeout: 15000,
        maxBuffer: 1024 * 1024
      }
    );

    const firstLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    const createdAt = parseDateValue(firstLine ?? "");
    if (createdAt) {
      gitFollowCreatedAtCache.set(cacheKey, createdAt);
    }
    return createdAt;
  } catch {
    return null;
  }
}

async function readGitCreatedAt(relativePath: string): Promise<Date | null> {
  if (!relativePath.startsWith("pr/") || path.posix.extname(relativePath).toLowerCase() !== ".md") {
    return null;
  }

  const { docsRoot } = getConfig();
  const head = await resolveGitHead(docsRoot);
  if (!head) {
    return null;
  }

  const index = await buildGitCreatedAtIndex(docsRoot, head);
  const indexedCreatedAt = index?.get(relativePath);
  if (indexedCreatedAt) {
    return indexedCreatedAt;
  }

  return readGitCreatedAtWithFollow(docsRoot, head, relativePath);
}

export async function resolvePrFileCreatedAt(absolutePath: string, relativePath: string, stats: FileStats): Promise<Date> {
  const frontmatterCreatedAt = await readFrontmatterCreatedAt(absolutePath, stats);
  if (frontmatterCreatedAt) {
    return frontmatterCreatedAt;
  }

  const gitCreatedAt = await readGitCreatedAt(relativePath);
  if (gitCreatedAt) {
    return gitCreatedAt;
  }

  const filenameCreatedAt = parseCreatedAtFromFileName(path.posix.basename(relativePath));
  if (filenameCreatedAt) {
    return filenameCreatedAt;
  }

  return stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime;
}

export function resetPrFileCreatedAtCachesForTests(): void {
  gitCreatedAtByHeadCache.clear();
}
