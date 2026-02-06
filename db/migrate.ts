import { sql } from "drizzle-orm";
import { getDb } from "./client";

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
