import path from "node:path";
import { desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { starredDocs } from "@/db/schema";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import type { DocStarStatus, StarredDocRecord } from "@/features/docs/domain/types";
import { readPathMeta } from "@/features/docs/services/docsFsService";

let schemaReady = false;

function toIso(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapStarredDoc(row: typeof starredDocs.$inferSelect): StarredDocRecord {
  return {
    path: row.path,
    name: row.name,
    starredAt: toIso(row.starredAt)
  };
}

function buildDocStarStatus(inputPath: string, row: typeof starredDocs.$inferSelect | null): DocStarStatus {
  const normalizedPath = resolveDocsPath(inputPath).relativePath;

  return {
    path: normalizedPath,
    name: row?.name ?? path.posix.basename(normalizedPath),
    isStarred: Boolean(row),
    starredAt: row ? toIso(row.starredAt) : null
  };
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }

  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS starred_docs (
      path TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      starred_at INTEGER NOT NULL
    );
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS starred_docs_starred_idx ON starred_docs(starred_at DESC);`);

  schemaReady = true;
}

async function purgeMissingRows(rows: Array<typeof starredDocs.$inferSelect>): Promise<Array<typeof starredDocs.$inferSelect>> {
  if (rows.length === 0) {
    return rows;
  }

  const db = getDb();
  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        const meta = await readPathMeta(row.path);
        return meta.nodeType === "file" ? row : null;
      } catch {
        return null;
      }
    })
  );

  const missingPaths = rows.filter((_, index) => results[index] === null).map((row) => row.path);
  for (const missingPath of missingPaths) {
    await db.delete(starredDocs).where(eq(starredDocs.path, missingPath));
  }

  return results.filter((row): row is typeof starredDocs.$inferSelect => row !== null);
}

export async function listStarredDocs(filter?: { pathPrefix?: string }): Promise<StarredDocRecord[]> {
  await ensureSchema();
  const db = getDb();
  const rows = filter?.pathPrefix
    ? await db.select().from(starredDocs).where(like(starredDocs.path, `${filter.pathPrefix}%`)).orderBy(desc(starredDocs.starredAt))
    : await db.select().from(starredDocs).orderBy(desc(starredDocs.starredAt));

  const activeRows = await purgeMissingRows(rows);
  return activeRows.map(mapStarredDoc);
}

export async function getDocStarStatus(inputPath: string): Promise<DocStarStatus> {
  await ensureSchema();
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  const db = getDb();
  const [existing] = await db.select().from(starredDocs).where(eq(starredDocs.path, normalizedPath)).limit(1);

  if (!existing) {
    return buildDocStarStatus(normalizedPath, null);
  }

  try {
    const meta = await readPathMeta(normalizedPath);
    if (meta.nodeType !== "file") {
      throw new Error("starred path must be a file");
    }

    return buildDocStarStatus(normalizedPath, existing);
  } catch {
    await db.delete(starredDocs).where(eq(starredDocs.path, normalizedPath));
    return buildDocStarStatus(normalizedPath, null);
  }
}

export async function setDocStarStatus(inputPath: string, isStarred: boolean): Promise<DocStarStatus> {
  await ensureSchema();
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  const db = getDb();

  if (!isStarred) {
    await db.delete(starredDocs).where(eq(starredDocs.path, normalizedPath));
    return buildDocStarStatus(normalizedPath, null);
  }

  const meta = await readPathMeta(normalizedPath);
  if (meta.nodeType !== "file") {
    throw new Error("path must be a file");
  }

  const name = path.posix.basename(normalizedPath);
  const starredAt = new Date();
  await db
    .insert(starredDocs)
    .values({
      path: normalizedPath,
      name,
      starredAt
    })
    .onConflictDoUpdate({
      target: starredDocs.path,
      set: {
        name,
        starredAt
      }
    });

  return buildDocStarStatus(normalizedPath, {
    path: normalizedPath,
    name,
    starredAt
  });
}
