import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { prReviewFiles } from "@/db/schema";
import type { PrFileRecord } from "@/features/reviews/domain/types";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { getConfig } from "@/shared/utils/env";

type PrFileSnapshot = {
  path: string;
  name: string;
  dateFolder: string;
  createdAt: Date;
  modifiedAt: Date;
};

let schemaReady = false;
let activeSync: Promise<void> | null = null;

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

function mapPrFile(row: typeof prReviewFiles.$inferSelect): PrFileRecord {
  return {
    path: row.path,
    name: row.name,
    dateFolder: row.dateFolder,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    modifiedAt: toIso(row.modifiedAt) ?? new Date(0).toISOString(),
    isRead: Boolean(row.isRead),
    readAt: toIso(row.readAt)
  };
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
      created_at INTEGER NOT NULL,
      modified_at INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at INTEGER,
      last_seen_at INTEGER NOT NULL
    );
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_date_idx ON pr_review_files(date_folder);`);
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
    const createdAt = stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime;
    const docRelativePath = `pr/${toPosixPath(childRelative)}`;

    files.push({
      path: docRelativePath,
      name: entry.name,
      dateFolder: extractDateFolder(docRelativePath),
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
      await db
        .insert(prReviewFiles)
        .values({
          path: file.path,
          name: file.name,
          dateFolder: file.dateFolder,
          createdAt: file.createdAt,
          modifiedAt: file.modifiedAt,
          lastSeenAt: now
        })
        .onConflictDoUpdate({
          target: prReviewFiles.path,
          set: {
            name: file.name,
            dateFolder: file.dateFolder,
            createdAt: file.createdAt,
            modifiedAt: file.modifiedAt,
            lastSeenAt: now
          }
        });
    }

    await db.delete(prReviewFiles).where(and(lt(prReviewFiles.lastSeenAt, now), sql`${prReviewFiles.path} LIKE 'pr/%'`));
  })().finally(() => {
    activeSync = null;
  });

  return activeSync;
}

export async function listPrFiles(filter?: { dateFolder?: string; query?: string }): Promise<PrFileRecord[]> {
  await ensurePrFilesSchema();
  const db = getDb();
  const rows = await db.select().from(prReviewFiles).orderBy(desc(prReviewFiles.createdAt), desc(prReviewFiles.modifiedAt));
  const query = filter?.query?.trim().toLowerCase();

  return rows
    .filter((row) => {
      if (row.path.startsWith("pr/") === false) {
        return false;
      }

      if (filter?.dateFolder && row.dateFolder !== filter.dateFolder) {
        return false;
      }

      if (!query) {
        return true;
      }

      return row.path.toLowerCase().includes(query) || row.name.toLowerCase().includes(query);
    })
    .map(mapPrFile);
}

export async function listPrDateFolders(): Promise<string[]> {
  await ensurePrFilesSchema();
  const db = getDb();
  const rows = await db.select({ dateFolder: prReviewFiles.dateFolder }).from(prReviewFiles);
  return Array.from(new Set(rows.map((row) => row.dateFolder))).sort((a, b) => b.localeCompare(a, "zh-CN"));
}

export async function markPrFileRead(inputPath: string, isRead = true): Promise<PrFileRecord | null> {
  await ensurePrFilesSchema();
  const db = getDb();

  const [existing] = await db.select().from(prReviewFiles).where(eq(prReviewFiles.path, inputPath)).limit(1);
  if (!existing) {
    return null;
  }

  const now = new Date();
  await db
    .update(prReviewFiles)
    .set({
      isRead,
      readAt: isRead ? now : null,
      lastSeenAt: now
    })
    .where(eq(prReviewFiles.path, inputPath));

  const [updated] = await db.select().from(prReviewFiles).where(eq(prReviewFiles.path, inputPath)).limit(1);
  return updated ? mapPrFile(updated) : null;
}
