import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const docStates = sqliteTable("doc_states", {
  path: text("path").primaryKey(),
  name: text("name").notNull(),
  isStarred: integer("is_starred", { mode: "boolean" }).notNull().default(false),
  starredAt: integer("starred_at", { mode: "timestamp" }),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  readAt: integer("read_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});

export const starredDocs = sqliteTable("starred_docs", {
  path: text("path").primaryKey(),
  name: text("name").notNull(),
  starredAt: integer("starred_at", { mode: "timestamp" }).notNull()
});

export const chatConversations = sqliteTable(
  "chat_conversations",
  {
    id: text("id").primaryKey(),
    docsRoot: text("docs_root").notNull(),
    docPath: text("doc_path").notNull(),
    repositoryPath: text("repository_path").notNull(),
    lastRevision: text("last_revision"),
    activeGenerationId: text("active_generation_id"),
    activeRevision: text("active_revision"),
    leaseExpiresAt: integer("lease_expires_at"),
    leaseDurationMs: integer("lease_duration_ms"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => [uniqueIndex("chat_conversations_root_path_uidx").on(table.docsRoot, table.docPath)]
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    status: text("status").notNull(),
    error: text("error"),
    parentMessageId: text("parent_message_id"),
    generationId: text("generation_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("chat_messages_conversation_position_uidx").on(table.conversationId, table.position),
    index("chat_messages_generation_idx").on(table.generationId)
  ]
);
