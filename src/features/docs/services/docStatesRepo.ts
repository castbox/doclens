import path from "node:path";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { docStates } from "@/db/schema";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { readPathMeta } from "@/features/docs/services/docsFsService";

export type DocStateRecord = {
  path: string;
  name: string;
  isStarred: boolean;
  starredAt: string | null;
  isRead: boolean;
  readAt: string | null;
};

let schemaReady = false;

function toIso(value: Date | string | number | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildDocStateRecord(inputPath: string, row: typeof docStates.$inferSelect | null): DocStateRecord {
  const normalizedPath = resolveDocsPath(inputPath).relativePath;

  return {
    path: normalizedPath,
    name: row?.name ?? path.posix.basename(normalizedPath),
    isStarred: Boolean(row?.isStarred),
    starredAt: toIso(row?.starredAt ?? null),
    isRead: Boolean(row?.isRead),
    readAt: toIso(row?.readAt ?? null)
  };
}

async function filterExistingRows(rows: Array<typeof docStates.$inferSelect>): Promise<Array<typeof docStates.$inferSelect>> {
  if (rows.length === 0) {
    return rows;
  }

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

  return results.filter((row): row is typeof docStates.$inferSelect => row !== null);
}

export async function ensureDocStatesSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }

  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS doc_states (
      path TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      is_starred INTEGER NOT NULL DEFAULT 0,
      starred_at INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      read_at INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS doc_states_starred_idx ON doc_states(is_starred, starred_at DESC);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS doc_states_read_idx ON doc_states(is_read, read_at DESC);`);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS starred_docs (
      path TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      starred_at INTEGER NOT NULL
    );
  `);
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
  await db.run(sql`
    INSERT OR IGNORE INTO doc_states (path, name, is_starred, starred_at, is_read, read_at, updated_at)
    SELECT path, name, 1, starred_at, 0, NULL, starred_at
    FROM starred_docs
  `);
  await db.run(sql`
    UPDATE doc_states
    SET
      name = COALESCE((SELECT starred_docs.name FROM starred_docs WHERE starred_docs.path = doc_states.path), doc_states.name),
      is_starred = CASE
        WHEN EXISTS (SELECT 1 FROM starred_docs WHERE starred_docs.path = doc_states.path) THEN 1
        ELSE doc_states.is_starred
      END,
      starred_at = COALESCE(
        doc_states.starred_at,
        (SELECT starred_docs.starred_at FROM starred_docs WHERE starred_docs.path = doc_states.path)
      ),
      updated_at = CASE
        WHEN COALESCE((SELECT starred_docs.starred_at FROM starred_docs WHERE starred_docs.path = doc_states.path), doc_states.updated_at) > doc_states.updated_at
        THEN COALESCE((SELECT starred_docs.starred_at FROM starred_docs WHERE starred_docs.path = doc_states.path), doc_states.updated_at)
        ELSE doc_states.updated_at
      END
    WHERE EXISTS (SELECT 1 FROM starred_docs WHERE starred_docs.path = doc_states.path);
  `);
  await db.run(sql`
    INSERT OR IGNORE INTO doc_states (path, name, is_starred, starred_at, is_read, read_at, updated_at)
    SELECT path, name, 0, NULL, is_read, read_at, COALESCE(read_at, last_seen_at, modified_at, created_at)
    FROM pr_review_files
    WHERE path LIKE 'pr/%'
  `);
  await db.run(sql`
    UPDATE doc_states
    SET
      name = COALESCE((SELECT pr_review_files.name FROM pr_review_files WHERE pr_review_files.path = doc_states.path), doc_states.name),
      is_read = CASE
        WHEN COALESCE((SELECT pr_review_files.is_read FROM pr_review_files WHERE pr_review_files.path = doc_states.path), 0) = 1 THEN 1
        ELSE doc_states.is_read
      END,
      read_at = COALESCE(
        doc_states.read_at,
        (SELECT pr_review_files.read_at FROM pr_review_files WHERE pr_review_files.path = doc_states.path)
      ),
      updated_at = CASE
        WHEN COALESCE(
          (SELECT COALESCE(pr_review_files.read_at, pr_review_files.last_seen_at, pr_review_files.modified_at, pr_review_files.created_at) FROM pr_review_files WHERE pr_review_files.path = doc_states.path),
          doc_states.updated_at
        ) > doc_states.updated_at
        THEN COALESCE(
          (SELECT COALESCE(pr_review_files.read_at, pr_review_files.last_seen_at, pr_review_files.modified_at, pr_review_files.created_at) FROM pr_review_files WHERE pr_review_files.path = doc_states.path),
          doc_states.updated_at
        )
        ELSE doc_states.updated_at
      END
    WHERE doc_states.path LIKE 'pr/%' AND EXISTS (SELECT 1 FROM pr_review_files WHERE pr_review_files.path = doc_states.path);
  `);

  schemaReady = true;
}

export async function getDocState(inputPath: string): Promise<DocStateRecord> {
  await ensureDocStatesSchema();
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  const db = getDb();
  const [row] = await db.select().from(docStates).where(eq(docStates.path, normalizedPath)).limit(1);
  return buildDocStateRecord(normalizedPath, row ?? null);
}

export async function listStarredDocStates(filter?: { pathPrefix?: string }): Promise<DocStateRecord[]> {
  await ensureDocStatesSchema();
  const db = getDb();
  const rows = filter?.pathPrefix
    ? await db
        .select()
        .from(docStates)
        .where(and(eq(docStates.isStarred, true), like(docStates.path, `${filter.pathPrefix}%`)))
        .orderBy(desc(docStates.starredAt))
    : await db.select().from(docStates).where(eq(docStates.isStarred, true)).orderBy(desc(docStates.starredAt));

  const visibleRows = await filterExistingRows(rows);
  return visibleRows.map((row) => buildDocStateRecord(row.path, row));
}

export async function setDocStarState(inputPath: string, isStarred: boolean): Promise<DocStateRecord> {
  await ensureDocStatesSchema();
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  const db = getDb();
  const now = new Date();
  const name = path.posix.basename(normalizedPath);

  if (isStarred) {
    const meta = await readPathMeta(normalizedPath);
    if (meta.nodeType !== "file") {
      throw new Error("path must be a file");
    }
  }

  await db
    .insert(docStates)
    .values({
      path: normalizedPath,
      name,
      isStarred,
      starredAt: isStarred ? now : null,
      isRead: false,
      readAt: null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: docStates.path,
      set: {
        name,
        isStarred,
        starredAt: isStarred ? now : null,
        updatedAt: now
      }
    });

  return getDocState(normalizedPath);
}

export async function setDocReadState(inputPath: string, isRead: boolean, options?: { name?: string }): Promise<DocStateRecord> {
  await ensureDocStatesSchema();
  const normalizedPath = resolveDocsPath(inputPath).relativePath;
  const db = getDb();
  const now = new Date();
  const name = options?.name ?? path.posix.basename(normalizedPath);

  await db
    .insert(docStates)
    .values({
      path: normalizedPath,
      name,
      isStarred: false,
      starredAt: null,
      isRead,
      readAt: isRead ? now : null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: docStates.path,
      set: {
        name,
        isRead,
        readAt: isRead ? now : null,
        updatedAt: now
      }
    });

  return getDocState(normalizedPath);
}
