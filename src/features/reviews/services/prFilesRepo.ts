import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, like, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { docStates, prReviewFiles } from "@/db/schema";
import type { PrFileReadFilter, PrFileRecord } from "@/features/reviews/domain/types";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { ensureDocStatesSchema, setDocReadState } from "@/features/docs/services/docStatesRepo";
import { getConfig } from "@/shared/utils/env";
import { resolvePrFileCreatedAt } from "./prFileCreatedAt";

type PrFileSnapshot = {
  path: string;
  name: string;
  dateFolder: string;
  category: string;
  createdAt: Date;
  modifiedAt: Date;
};

let schemaReady = false;
let activeSync: Promise<void> | null = null;
function isDuplicateColumnError(error: unknown, columnName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const messages = [error.message];
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    messages.push(cause.message);
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();
    return normalized.includes("duplicate column name") && normalized.includes(columnName.toLowerCase());
  });
}

function toIso(value: Date | string | number | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function shouldIgnoreName(name: string): boolean {
  const { searchIgnore } = getConfig();
  if (name.startsWith(".")) {
    return true;
  }

  return searchIgnore.includes(name);
}

function toPosixPath(inputPath: string): string {
  return inputPath.split(path.sep).join(path.posix.sep);
}

function extractDateFolder(relativePath: string): string {
  const segments = relativePath.split("/");
  return segments.length >= 3 ? segments[1] : "unknown";
}

function extractCategory(relativePath: string): string {
  const segments = relativePath.split("/");
  return segments.length >= 4 ? segments[2] : "uncategorized";
}

async function readPrFileSnapshot(inputPath: string): Promise<PrFileSnapshot | null> {
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  const { absolutePath } = resolveDocsPath(normalizedPath);
  let stats: Awaited<ReturnType<typeof fs.stat>>;

  try {
    stats = await fs.stat(absolutePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }

  if (!stats.isFile()) {
    return null;
  }

  const createdAt = await resolvePrFileCreatedAt(absolutePath, normalizedPath, stats);
  return {
    path: normalizedPath,
    name: path.posix.basename(normalizedPath),
    dateFolder: extractDateFolder(normalizedPath),
    category: extractCategory(normalizedPath),
    createdAt,
    modifiedAt: stats.mtime
  };
}

async function addCategoryColumnIfMissing(): Promise<void> {
  const db = getDb();

  try {
    await db.run(sql`ALTER TABLE pr_review_files ADD COLUMN category TEXT NOT NULL DEFAULT 'uncategorized';`);
  } catch (error) {
    if (isDuplicateColumnError(error, "category")) {
      return;
    }

    throw error;
  }
}

function mapPrFile(row: typeof prReviewFiles.$inferSelect, state: typeof docStates.$inferSelect | null): PrFileRecord {
  return {
    path: row.path,
    name: row.name,
    dateFolder: row.dateFolder,
    category: row.category ?? "uncategorized",
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    modifiedAt: toIso(row.modifiedAt) ?? new Date(0).toISOString(),
    isStarred: Boolean(state?.isStarred),
    starredAt: toIso(state?.starredAt ?? null),
    isRead: Boolean(state?.isRead),
    readAt: toIso(state?.readAt ?? null)
  };
}

async function listPrFileRows(filter?: { category?: string; readFilter?: PrFileReadFilter }) {
  await ensurePrFilesSchema();
  await ensureDocStatesSchema();
  const db = getDb();
  const conditions = [like(prReviewFiles.path, "pr/%")];

  if (filter?.category) {
    conditions.push(eq(prReviewFiles.category, filter.category));
  }

  if (filter?.readFilter === "read") {
    conditions.push(eq(docStates.isRead, true));
  }

  if (filter?.readFilter === "unread") {
    conditions.push(sql`(${docStates.isRead} IS NULL OR ${docStates.isRead} = 0)`);
  }

  return db
    .select({
      file: prReviewFiles,
      state: docStates
    })
    .from(prReviewFiles)
    .leftJoin(docStates, eq(prReviewFiles.path, docStates.path))
    .where(and(...conditions))
    .orderBy(desc(prReviewFiles.createdAt), desc(prReviewFiles.modifiedAt));
}

async function getPrFileRow(inputPath: string) {
  await ensurePrFilesSchema();
  await ensureDocStatesSchema();
  const db = getDb();
  const [row] = await db
    .select({
      file: prReviewFiles,
      state: docStates
    })
    .from(prReviewFiles)
    .leftJoin(docStates, eq(prReviewFiles.path, docStates.path))
    .where(eq(prReviewFiles.path, inputPath))
    .limit(1);

  return row ?? null;
}

async function upsertPrFileSnapshot(snapshot: PrFileSnapshot, seenAt: Date): Promise<void> {
  const db = getDb();
  await db
    .insert(prReviewFiles)
    .values({
      path: snapshot.path,
      name: snapshot.name,
      dateFolder: snapshot.dateFolder,
      category: snapshot.category,
      createdAt: snapshot.createdAt,
      modifiedAt: snapshot.modifiedAt,
      lastSeenAt: seenAt
    })
    .onConflictDoUpdate({
      target: prReviewFiles.path,
      set: {
        name: snapshot.name,
        dateFolder: snapshot.dateFolder,
        category: snapshot.category,
        createdAt: snapshot.createdAt,
        modifiedAt: snapshot.modifiedAt,
        lastSeenAt: seenAt
      }
    });
}

async function ensurePrFilesSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }

  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS pr_review_files (
      path TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      date_folder TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'uncategorized',
      created_at INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at INTEGER,
      last_seen_at INTEGER NOT NULL
    );
  `);
  await addCategoryColumnIfMissing();
  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_date_idx ON pr_review_files(date_folder);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_category_idx ON pr_review_files(category);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_created_idx ON pr_review_files(created_at DESC);`);

  schemaReady = true;
}

async function walkPrFiles(absoluteDir: string, relativeDir: string, files: PrFileSnapshot[]): Promise<void> {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldIgnoreName(entry.name)) {
      continue;
    }

    const childAbsolute = path.resolve(absoluteDir, entry.name);
    const childRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await walkPrFiles(childAbsolute, childRelative, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.stat(childAbsolute);
    const docRelativePath = `pr/${toPosixPath(childRelative)}`;
    const createdAt = await resolvePrFileCreatedAt(childAbsolute, docRelativePath, stats);

    files.push({
      path: docRelativePath,
      name: entry.name,
      dateFolder: extractDateFolder(docRelativePath),
      category: extractCategory(docRelativePath),
      createdAt,
      modifiedAt: stats.mtime
    });
  }
}

async function collectPrFilesSnapshot(): Promise<PrFileSnapshot[]> {
  const { absolutePath } = resolveDocsPath("pr");
  let stats: Awaited<ReturnType<typeof fs.stat>>;

  try {
    stats = await fs.stat(absolutePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const files: PrFileSnapshot[] = [];
  await walkPrFiles(absolutePath, "", files);
  return files;
}

export async function syncPrFilesSnapshot(): Promise<void> {
  if (activeSync) {
    return activeSync;
  }

  activeSync = (async () => {
    await ensurePrFilesSchema();
    const db = getDb();
    const now = new Date();
    const files = await collectPrFilesSnapshot();

    for (const file of files) {
      await upsertPrFileSnapshot(file, now);
    }

    await db.delete(prReviewFiles).where(and(lt(prReviewFiles.lastSeenAt, now), sql`${prReviewFiles.path} LIKE 'pr/%'`));
  })().finally(() => {
    activeSync = null;
  });

  return activeSync;
}

export async function hasPrFilesSnapshot(): Promise<boolean> {
  await ensurePrFilesSchema();
  const db = getDb();
  const [row] = await db.select({ path: prReviewFiles.path }).from(prReviewFiles).where(like(prReviewFiles.path, "pr/%")).limit(1);
  return Boolean(row?.path);
}

export async function ensurePrFileTracked(inputPath: string): Promise<void> {
  await ensurePrFilesSchema();
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  if (!normalizedPath.startsWith("pr/")) {
    return;
  }

  const snapshot = await readPrFileSnapshot(normalizedPath);
  if (!snapshot) {
    return;
  }

  await upsertPrFileSnapshot(snapshot, new Date());
}

export async function listPrFiles(filter?: { category?: string; readFilter?: PrFileReadFilter }): Promise<PrFileRecord[]> {
  const rows = await listPrFileRows(filter);
  return rows.map((row) => mapPrFile(row.file, row.state));
}

export async function listPrCategories(): Promise<string[]> {
  await ensurePrFilesSchema();
  const db = getDb();
  const rows = await db
    .select({ category: prReviewFiles.category })
    .from(prReviewFiles)
    .where(like(prReviewFiles.path, "pr/%"))
    .groupBy(prReviewFiles.category);
  return Array.from(new Set(rows.map((row) => row.category))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function markPrFileRead(inputPath: string, isRead = true): Promise<PrFileRecord | null> {
  await ensurePrFilesSchema();
  await ensureDocStatesSchema();
  const db = getDb();

  const [existing] = await db.select().from(prReviewFiles).where(eq(prReviewFiles.path, inputPath)).limit(1);
  if (!existing) {
    return null;
  }

  await setDocReadState(inputPath, isRead, { name: existing.name });
  const row = await getPrFileRow(inputPath);
  return row ? mapPrFile(row.file, row.state) : null;
}

export function resetPrFilesRepoForTests(): void {
  schemaReady = false;
  activeSync = null;
}
