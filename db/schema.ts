import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviewSheets = sqliteTable("review_sheets", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  docPath: text("doc_path").notNull(),
  docType: text("doc_type").notNull(),
  status: text("status").notNull(),
  conclusion: text("conclusion").notNull(),
  summary: text("summary").notNull(),
  owner: text("owner").notNull(),
  reviewer: text("reviewer").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const reviewItems = sqliteTable("review_items", {
  id: text("id").primaryKey(),
  sheetId: text("sheet_id")
    .notNull()
    .references(() => reviewSheets.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  suggestion: text("suggestion").notNull(),
  assignee: text("assignee").notNull(),
  dueDate: text("due_date"),
  state: text("state").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const prReviewFiles = sqliteTable("pr_review_files", {
  path: text("path").primaryKey(),
  name: text("name").notNull(),
  dateFolder: text("date_folder").notNull(),
  category: text("category").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  modifiedAt: integer("modified_at", { mode: "timestamp" }).notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  readAt: integer("read_at", { mode: "timestamp" }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull()
});
