import { sql } from "drizzle-orm";
import { getDb } from "./client";

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

async function main() {
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

  try {
    await db.run(sql`ALTER TABLE pr_review_files ADD COLUMN category TEXT NOT NULL DEFAULT 'uncategorized';`);
  } catch (error) {
    if (!isDuplicateColumnError(error, "category")) {
      throw error;
    }
  }

  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_date_idx ON pr_review_files(date_folder);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_category_idx ON pr_review_files(category);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS pr_review_files_created_idx ON pr_review_files(created_at DESC);`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
