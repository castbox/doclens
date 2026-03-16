import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getConfig } from "@/shared/utils/env";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const { dbPath } = getConfig();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  sqliteInstance = new Database(dbPath);
  sqliteInstance.pragma("journal_mode = WAL");

  dbInstance = drizzle(sqliteInstance);
  return dbInstance;
}

export function resetDbClientForTests(): void {
  sqliteInstance?.close();
  sqliteInstance = null;
  dbInstance = null;
}
