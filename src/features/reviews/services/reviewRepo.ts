import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reviewItems, reviewSheets } from "@/db/schema";
import { assertReviewStatusTransition } from "@/features/reviews/domain/reviewStateMachine";
import type {
  CreateReviewItemInput,
  CreateReviewSheetInput,
  ReviewItem,
  ReviewSheet,
  ReviewSheetWithItems,
  ReviewStatus,
  UpdateReviewItemInput,
  UpdateReviewSheetInput
} from "@/features/reviews/domain/types";

let schemaReady = false;

function toIso(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSheet(row: typeof reviewSheets.$inferSelect): ReviewSheet {
  return {
    id: row.id,
    title: row.title,
    docPath: row.docPath,
    docType: row.docType as ReviewSheet["docType"],
    status: row.status as ReviewStatus,
    conclusion: row.conclusion as ReviewSheet["conclusion"],
    summary: row.summary,
    owner: row.owner,
    reviewer: row.reviewer,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

function mapItem(row: typeof reviewItems.$inferSelect): ReviewItem {
  return {
    id: row.id,
    sheetId: row.sheetId,
    severity: row.severity as ReviewItem["severity"],
    description: row.description,
    suggestion: row.suggestion,
    assignee: row.assignee,
    dueDate: row.dueDate ?? null,
    state: row.state as ReviewItem["state"],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) {
    return;
  }

  const db = getDb();

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS review_sheets (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      doc_path TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      status TEXT NOT NULL,
      conclusion TEXT NOT NULL,
      summary TEXT NOT NULL,
      owner TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY NOT NULL,
      sheet_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      assignee TEXT NOT NULL,
      due_date TEXT,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(sheet_id) REFERENCES review_sheets(id) ON DELETE CASCADE
    );
  `);

  await db.run(sql`CREATE INDEX IF NOT EXISTS review_items_sheet_id_idx ON review_items(sheet_id);`);

  schemaReady = true;
}

export async function listReviewSheets(filter?: { docPath?: string; status?: string }): Promise<ReviewSheet[]> {
  await ensureSchema();
  const db = getDb();

  const conditions = [];
  if (filter?.docPath) {
    conditions.push(eq(reviewSheets.docPath, filter.docPath));
  }

  if (filter?.status) {
    conditions.push(eq(reviewSheets.status, filter.status));
  }

  const rows =
    conditions.length > 0
      ? await db.select().from(reviewSheets).where(and(...conditions)).orderBy(desc(reviewSheets.updatedAt))
      : await db.select().from(reviewSheets).orderBy(desc(reviewSheets.updatedAt));

  return rows.map(mapSheet);
}

export async function getReviewSheetById(id: string): Promise<ReviewSheetWithItems | null> {
  await ensureSchema();
  const db = getDb();

  const [sheet] = await db.select().from(reviewSheets).where(eq(reviewSheets.id, id)).limit(1);
  if (!sheet) {
    return null;
  }

  const items = await db.select().from(reviewItems).where(eq(reviewItems.sheetId, id)).orderBy(asc(reviewItems.createdAt));

  return {
    ...mapSheet(sheet),
    items: items.map(mapItem)
  };
}

export async function createReviewSheet(input: CreateReviewSheetInput): Promise<ReviewSheet> {
  await ensureSchema();
  const db = getDb();
  const now = new Date();
  const id = randomUUID();

  await db.insert(reviewSheets).values({
    id,
    title: input.title,
    docPath: input.docPath,
    docType: input.docType,
    status: input.status ?? "Draft",
    conclusion: input.conclusion,
    summary: input.summary,
    owner: input.owner,
    reviewer: input.reviewer,
    createdAt: now,
    updatedAt: now
  });

  const [row] = await db.select().from(reviewSheets).where(eq(reviewSheets.id, id)).limit(1);
  if (!row) {
    throw new Error("Failed to create review sheet");
  }

  return mapSheet(row);
}

export async function updateReviewSheet(id: string, patch: UpdateReviewSheetInput): Promise<ReviewSheet | null> {
  await ensureSchema();
  const db = getDb();

  const [existing] = await db.select().from(reviewSheets).where(eq(reviewSheets.id, id)).limit(1);
  if (!existing) {
    return null;
  }

  if (patch.status) {
    assertReviewStatusTransition(existing.status as ReviewStatus, patch.status);
  }

  await db
    .update(reviewSheets)
    .set({
      title: patch.title ?? existing.title,
      docType: patch.docType ?? existing.docType,
      status: patch.status ?? existing.status,
      conclusion: patch.conclusion ?? existing.conclusion,
      summary: patch.summary ?? existing.summary,
      owner: patch.owner ?? existing.owner,
      reviewer: patch.reviewer ?? existing.reviewer,
      updatedAt: new Date()
    })
    .where(eq(reviewSheets.id, id));

  const [updated] = await db.select().from(reviewSheets).where(eq(reviewSheets.id, id)).limit(1);
  return updated ? mapSheet(updated) : null;
}

export async function createReviewItem(sheetId: string, input: CreateReviewItemInput): Promise<ReviewItem> {
  await ensureSchema();
  const db = getDb();
  const now = new Date();
  const id = randomUUID();

  const [sheet] = await db.select().from(reviewSheets).where(eq(reviewSheets.id, sheetId)).limit(1);
  if (!sheet) {
    throw new Error("Review sheet not found");
  }

  await db.insert(reviewItems).values({
    id,
    sheetId,
    severity: input.severity,
    description: input.description,
    suggestion: input.suggestion,
    assignee: input.assignee,
    dueDate: input.dueDate ?? null,
    state: input.state ?? "Open",
    createdAt: now,
    updatedAt: now
  });

  await db.update(reviewSheets).set({ updatedAt: new Date() }).where(eq(reviewSheets.id, sheetId));

  const [row] = await db.select().from(reviewItems).where(eq(reviewItems.id, id)).limit(1);
  if (!row) {
    throw new Error("Failed to create review item");
  }

  return mapItem(row);
}

export async function updateReviewItem(sheetId: string, itemId: string, patch: UpdateReviewItemInput): Promise<ReviewItem | null> {
  await ensureSchema();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.id, itemId), eq(reviewItems.sheetId, sheetId)))
    .limit(1);

  if (!existing) {
    return null;
  }

  await db
    .update(reviewItems)
    .set({
      severity: patch.severity ?? existing.severity,
      description: patch.description ?? existing.description,
      suggestion: patch.suggestion ?? existing.suggestion,
      assignee: patch.assignee ?? existing.assignee,
      dueDate: patch.dueDate === undefined ? existing.dueDate : patch.dueDate,
      state: patch.state ?? existing.state,
      updatedAt: new Date()
    })
    .where(eq(reviewItems.id, itemId));

  await db.update(reviewSheets).set({ updatedAt: new Date() }).where(eq(reviewSheets.id, sheetId));

  const [updated] = await db.select().from(reviewItems).where(eq(reviewItems.id, itemId)).limit(1);
  return updated ? mapItem(updated) : null;
}
