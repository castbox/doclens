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

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS starred_docs (
      path TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      starred_at INTEGER NOT NULL
    );
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS starred_docs_starred_idx ON starred_docs(starred_at DESC);`);

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
