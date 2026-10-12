import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type {
  ChatDocumentIdentity,
  ChatGeneration,
  ChatHistoryPayload,
  ChatMessage,
  ChatMessageStatus,
  ChatRole,
  ChatTurn,
  DocumentChatRequest
} from "@/features/chat/domain/types";
import { selectChatContext } from "@/features/chat/domain/chatContext";
import {
  MAX_CHAT_HISTORY_PAGE_CHARS,
  MAX_CHAT_HISTORY_PAGE_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_QUESTION_CHARS
} from "@/features/chat/domain/types";

type Db = ReturnType<typeof getDb>;
type DbExecutor = Pick<Db, "all" | "get" | "run">;

type ConversationRow = {
  id: string;
  docs_root: string;
  doc_path: string;
  repository_path: string;
  last_revision: string | null;
  active_generation_id: string | null;
  active_revision: string | null;
  lease_expires_at: number | null;
  lease_duration_ms: number | null;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  position: number;
  role: string;
  content: string;
  status: string;
  error: string | null;
  parent_message_id: string | null;
  generation_id: string | null;
  created_at: number;
  updated_at: number;
};

const STALE_LEASE_MESSAGE = "生成租约已过期，已保留已生成内容";
const REPLY_LIMIT_MESSAGE = `助手回复不能超过 ${MAX_CHAT_MESSAGE_CHARS} 个字符`;

let schemaReadyDatabase: Db | null = null;

export class ChatHistoryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatHistoryError";
    this.status = status;
  }
}

export function ensureChatHistorySchema(): void {
  const db = getDb();
  if (schemaReadyDatabase === db) {
    return;
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY NOT NULL,
      docs_root TEXT NOT NULL,
      doc_path TEXT NOT NULL,
      repository_path TEXT NOT NULL,
      last_revision TEXT,
      active_generation_id TEXT,
      active_revision TEXT,
      lease_expires_at INTEGER,
      lease_duration_ms INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(docs_root, doc_path)
    );
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error TEXT,
      parent_message_id TEXT,
      generation_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(conversation_id, position),
      FOREIGN KEY(conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    );
  `);
  db.run(sql`CREATE INDEX IF NOT EXISTS chat_messages_generation_idx ON chat_messages(generation_id);`);
  schemaReadyDatabase = db;
}

function assertDocumentIdentity(document: ChatDocumentIdentity): void {
  if (!document.docsRoot.trim() || !document.path.trim() || !document.repositoryPath.trim() || !document.revision.trim()) {
    throw new ChatHistoryError("文档身份信息不完整", 400);
  }
}

function getConversationByDocument(executor: DbExecutor, document: ChatDocumentIdentity): ConversationRow | null {
  return (
    (executor.get<ConversationRow>(sql`
      SELECT * FROM chat_conversations
      WHERE docs_root = ${document.docsRoot} AND doc_path = ${document.path}
      LIMIT 1
    `) as ConversationRow | undefined) ?? null
  );
}

function getConversationById(executor: DbExecutor, conversationId: string): ConversationRow | null {
  return (
    (executor.get<ConversationRow>(sql`
      SELECT * FROM chat_conversations WHERE id = ${conversationId} LIMIT 1
    `) as ConversationRow | undefined) ?? null
  );
}

function toChatMessage(row: MessageRow): ChatMessage {
  const role: ChatRole = row.role === "user" ? "user" : "assistant";
  const statuses: ChatMessageStatus[] = ["pending", "streaming", "complete", "stopped", "error"];
  const status = statuses.includes(row.status as ChatMessageStatus) ? (row.status as ChatMessageStatus) : "error";

  return {
    id: row.id,
    role,
    content: row.content,
    status,
    error: row.error
  };
}

function makeHistoryPayload(
  conversation: ConversationRow | null,
  rows: MessageRow[],
  document: ChatDocumentIdentity,
  hasMore: boolean
): ChatHistoryPayload {
  return {
    conversationId: conversation?.id ?? null,
    messages: rows.map(toChatMessage),
    isGenerating: Boolean(conversation?.active_generation_id),
    documentChanged: Boolean(conversation?.last_revision && conversation.last_revision !== document.revision),
    hasMore
  };
}

function getHistoryPage(
  executor: DbExecutor,
  conversationId: string,
  beforeMessageId?: string
): { rows: MessageRow[]; hasMore: boolean } {
  let beforePosition: number | null = null;
  if (beforeMessageId) {
    const cursor = executor.get<{ id: string; conversation_id: string; position: number }>(sql`
      SELECT id, conversation_id, position FROM chat_messages
      WHERE id = ${beforeMessageId} AND conversation_id = ${conversationId}
      LIMIT 1
    `) as { id: string; conversation_id: string; position: number } | undefined;
    if (!cursor) {
      throw new ChatHistoryError("历史游标不属于当前文档", 409);
    }
    beforePosition = cursor.position;
  }

  const descendingRows = beforePosition === null
    ? executor.all<MessageRow>(sql`
        SELECT * FROM chat_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY position DESC
        LIMIT ${MAX_CHAT_HISTORY_PAGE_MESSAGES}
      `) as MessageRow[]
    : executor.all<MessageRow>(sql`
        SELECT * FROM chat_messages
        WHERE conversation_id = ${conversationId} AND position < ${beforePosition}
        ORDER BY position DESC
        LIMIT ${MAX_CHAT_HISTORY_PAGE_MESSAGES}
      `) as MessageRow[];

  const selectedDescending: MessageRow[] = [];
  let selectedChars = 0;
  for (const row of descendingRows) {
    if (selectedDescending.length >= MAX_CHAT_HISTORY_PAGE_MESSAGES || selectedChars + row.content.length > MAX_CHAT_HISTORY_PAGE_CHARS) {
      break;
    }
    selectedDescending.push(row);
    selectedChars += row.content.length;
  }

  const oldestSelected = selectedDescending[selectedDescending.length - 1];
  const hasMore = selectedDescending.length < descendingRows.length || Boolean(
    oldestSelected && executor.get<{ present: number }>(sql`
      SELECT 1 AS present FROM chat_messages
      WHERE conversation_id = ${conversationId} AND position < ${oldestSelected.position}
      LIMIT 1
    `)
  );

  return { rows: selectedDescending.reverse(), hasMore };
}

function getContextRows(
  executor: DbExecutor,
  conversationId: string,
  beforePosition?: number
): { rows: MessageRow[]; hasEarlierMessages: boolean } {
  const recentRows = beforePosition === undefined
    ? executor.all<MessageRow>(sql`
        SELECT * FROM chat_messages WHERE conversation_id = ${conversationId}
        ORDER BY position DESC LIMIT ${MAX_CHAT_HISTORY_PAGE_MESSAGES}
      `) as MessageRow[]
    : executor.all<MessageRow>(sql`
        SELECT * FROM chat_messages
        WHERE conversation_id = ${conversationId} AND position < ${beforePosition}
        ORDER BY position DESC LIMIT ${MAX_CHAT_HISTORY_PAGE_MESSAGES}
      `) as MessageRow[];
  const rows = recentRows.reverse();
  const oldestRecent = rows[0];
  const earlierMessage = oldestRecent
    ? executor.get<{ id: string }>(sql`
        SELECT id FROM chat_messages
        WHERE conversation_id = ${conversationId}
          AND position < ${oldestRecent.position}
          AND (role = 'user' OR parent_message_id IS NOT NULL)
        LIMIT 1
      `)
    : undefined;
  const summary = executor.get<MessageRow>(sql`
    SELECT * FROM chat_messages
    WHERE conversation_id = ${conversationId}
      AND role = 'assistant'
      AND parent_message_id IS NULL
      AND status IN ('complete', 'stopped')
      AND TRIM(content) != ''
    ORDER BY position DESC LIMIT 1
  `) as MessageRow | undefined;
  if (summary && !rows.some((row) => row.id === summary.id)) {
    rows.push(summary);
    rows.sort((left, right) => left.position - right.position);
  }
  return { rows, hasEarlierMessages: Boolean(earlierMessage) };
}

function getAssistantForGeneration(executor: DbExecutor, conversationId: string, generationId: string): MessageRow | null {
  return (
    (executor.get<MessageRow>(sql`
      SELECT * FROM chat_messages
      WHERE conversation_id = ${conversationId} AND generation_id = ${generationId} AND role = 'assistant'
      LIMIT 1
    `) as MessageRow | undefined) ?? null
  );
}

function clearConversationLease(executor: DbExecutor, conversationId: string, now: number, status: ChatMessageStatus, error: string | null): void {
  const conversation = getConversationById(executor, conversationId);
  if (!conversation?.active_generation_id) {
    return;
  }

  executor.run(sql`
    UPDATE chat_messages
    SET status = ${status}, error = ${error}, updated_at = ${now}
    WHERE conversation_id = ${conversationId}
      AND generation_id = ${conversation.active_generation_id}
      AND role = 'assistant'
      AND status IN ('pending', 'streaming')
  `);
  executor.run(sql`
    UPDATE chat_conversations
    SET active_generation_id = NULL,
        active_revision = NULL,
        lease_expires_at = NULL,
        lease_duration_ms = NULL,
        updated_at = ${now}
    WHERE id = ${conversationId} AND active_generation_id = ${conversation.active_generation_id}
  `);
}

function recoverExpiredLease(executor: DbExecutor, conversation: ConversationRow, now: number): ConversationRow {
  if (!conversation.active_generation_id) {
    return conversation;
  }

  if (conversation.lease_expires_at !== null && conversation.lease_expires_at > now) {
    return conversation;
  }

  clearConversationLease(executor, conversation.id, now, "stopped", STALE_LEASE_MESSAGE);
  return getConversationById(executor, conversation.id) ?? conversation;
}

function ensureConversation(executor: DbExecutor, document: ChatDocumentIdentity, now: number): ConversationRow {
  const id = randomUUID();
  executor.run(sql`
    INSERT INTO chat_conversations (
      id, docs_root, doc_path, repository_path, last_revision,
      active_generation_id, active_revision, lease_expires_at, lease_duration_ms,
      created_at, updated_at
    ) VALUES (
      ${id}, ${document.docsRoot}, ${document.path}, ${document.repositoryPath}, NULL,
      NULL, NULL, NULL, NULL, ${now}, ${now}
    ) ON CONFLICT(docs_root, doc_path) DO NOTHING
  `);
  const conversation = getConversationByDocument(executor, document);
  if (!conversation) {
    throw new ChatHistoryError("无法创建文档聊天记录", 500);
  }

  return conversation;
}

function nextMessagePosition(executor: DbExecutor, conversationId: string): number {
  const row = executor.get<{ next_position: number }>(sql`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_position
    FROM chat_messages WHERE conversation_id = ${conversationId}
  `) as { next_position: number };
  return row.next_position;
}

function insertMessage(
  executor: DbExecutor,
  input: {
    id: string;
    conversationId: string;
    position: number;
    role: ChatRole;
    content: string;
    status: ChatMessageStatus;
    parentMessageId: string | null;
    generationId: string | null;
    now: number;
  }
): void {
  executor.run(sql`
    INSERT INTO chat_messages (
      id, conversation_id, position, role, content, status, error,
      parent_message_id, generation_id, created_at, updated_at
    ) VALUES (
      ${input.id}, ${input.conversationId}, ${input.position}, ${input.role}, ${input.content},
      ${input.status}, NULL, ${input.parentMessageId}, ${input.generationId}, ${input.now}, ${input.now}
    )
  `);
}

function isUsableAssistantAttempt(row: MessageRow | undefined): row is MessageRow {
  return Boolean(
    row &&
      row.role === "assistant" &&
      row.content.trim() &&
      (row.status === "complete" || row.status === "stopped")
  );
}

function buildModelHistory(rows: MessageRow[], excludedUserMessageId?: string): ChatTurn[] {
  const result: ChatTurn[] = [];
  const summary = rows
    .filter((row) => row.role === "assistant" && row.parent_message_id === null && isUsableAssistantAttempt(row))
    .reduce<MessageRow | null>((latest, row) => (!latest || row.position > latest.position ? row : latest), null);

  if (summary) {
    result.push({ role: "assistant", content: summary.content });
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.role !== "user") {
      continue;
    }

    let attemptIndex = index + 1;
    let latestUsableAttempt: MessageRow | undefined;
    while (attemptIndex < rows.length) {
      const attempt = rows[attemptIndex];
      if (attempt?.role !== "assistant" || attempt.parent_message_id !== row.id) {
        break;
      }
      if (isUsableAssistantAttempt(attempt)) {
        latestUsableAttempt = attempt;
      }
      attemptIndex += 1;
    }

    if (row.id !== excludedUserMessageId && latestUsableAttempt && row.content.trim()) {
      result.push({ role: "user", content: row.content });
      result.push({ role: "assistant", content: latestUsableAttempt.content });
    }
    index = attemptIndex - 1;
  }

  return result;
}

function sameTurns(left: ChatTurn[], right: ChatTurn[]): boolean {
  return left.length === right.length && left.every((turn, index) => {
    const other = right[index];
    return other?.role === turn.role && other.content === turn.content;
  });
}

function selectModelContext(input: ChatTurn[]): { messages: ChatTurn[]; contextLimited: boolean } {
  const messages = selectChatContext(input);
  return { messages, contextLimited: !sameTurns(input, messages) };
}

export function getDocumentChatHistory(document: ChatDocumentIdentity, beforeMessageId?: string): ChatHistoryPayload {
  assertDocumentIdentity(document);
  ensureChatHistorySchema();
  const db = getDb();

  return db.transaction((tx) => {
    const now = Date.now();
    const conversation = getConversationByDocument(tx, document);
    if (!conversation) {
      if (beforeMessageId) {
        throw new ChatHistoryError("历史游标不属于当前文档", 409);
      }
      return makeHistoryPayload(null, [], document, false);
    }

    const current = recoverExpiredLease(tx, conversation, now);
    tx.run(sql`UPDATE chat_conversations SET repository_path = ${document.repositoryPath} WHERE id = ${current.id}`);
    const page = getHistoryPage(tx, current.id, beforeMessageId);
    return makeHistoryPayload(current, page.rows, document, page.hasMore);
  }, { behavior: "immediate" });
}

export function beginDocumentChatTurn(
  document: ChatDocumentIdentity,
  request: DocumentChatRequest,
  leaseDurationMs: number
): ChatGeneration {
  assertDocumentIdentity(document);
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new ChatHistoryError("生成租约时长必须是正整数", 400);
  }
  ensureChatHistorySchema();
  const db = getDb();

  return db.transaction((tx) => {
    const now = Date.now();
    let conversation = ensureConversation(tx, document, now);
    conversation = recoverExpiredLease(tx, conversation, now);
    if (conversation.active_generation_id) {
      throw new ChatHistoryError("该文档已有正在进行的生成任务", 409);
    }

    const generationId = randomUUID();
    let assistantMessageId: string;
    let messages: ChatTurn[];
    let contextLimited = false;

    if (request.action === "summary") {
      const existingMessage = tx.get<{ id: string }>(sql`
        SELECT id FROM chat_messages WHERE conversation_id = ${conversation.id} LIMIT 1
      `);
      if (existingMessage) {
        throw new ChatHistoryError("该文档已有聊天记录，不能重复生成概述", 409);
      }

      assistantMessageId = randomUUID();
      messages = [];
      insertMessage(tx, {
        id: assistantMessageId,
        conversationId: conversation.id,
        position: nextMessagePosition(tx, conversation.id),
        role: "assistant",
        content: "",
        status: "pending",
        parentMessageId: null,
        generationId,
        now
      });
    } else if (request.action === "send") {
      if (!request.content.trim()) {
        throw new ChatHistoryError("问题内容不能为空", 400);
      }
      if (request.content.length > MAX_QUESTION_CHARS) {
        throw new ChatHistoryError(`每个问题不能超过 ${MAX_QUESTION_CHARS} 个字符`, 413);
      }

      const context = getContextRows(tx, conversation.id);
      const input = [...buildModelHistory(context.rows), { role: "user" as const, content: request.content }];
      ({ messages, contextLimited } = selectModelContext(input));
      contextLimited ||= context.hasEarlierMessages;

      const userMessageId = randomUUID();
      assistantMessageId = randomUUID();
      const position = nextMessagePosition(tx, conversation.id);
      insertMessage(tx, {
        id: userMessageId,
        conversationId: conversation.id,
        position,
        role: "user",
        content: request.content,
        status: "complete",
        parentMessageId: null,
        generationId: null,
        now
      });
      insertMessage(tx, {
        id: assistantMessageId,
        conversationId: conversation.id,
        position: position + 1,
        role: "assistant",
        content: "",
        status: "pending",
        parentMessageId: userMessageId,
        generationId,
        now
      });
    } else {
      const target = tx.get<MessageRow>(sql`
        SELECT * FROM chat_messages
        WHERE conversation_id = ${conversation.id} AND id = ${request.messageId}
        LIMIT 1
      `) as MessageRow | undefined;
      const lastMessage = tx.get<{ id: string }>(sql`
        SELECT id FROM chat_messages WHERE conversation_id = ${conversation.id}
        ORDER BY position DESC LIMIT 1
      `) as { id: string } | undefined;
      if (
        !target ||
        target.id !== lastMessage?.id ||
        target.role !== "assistant" ||
        (target.status !== "error" && target.status !== "stopped")
      ) {
        throw new ChatHistoryError("只能重试该文档最后一条失败或已停止的助手消息", 409);
      }

      if (target.parent_message_id) {
        const context = getContextRows(tx, conversation.id, target.position);
        const userMessage = tx.get<MessageRow>(sql`
          SELECT * FROM chat_messages
          WHERE conversation_id = ${conversation.id} AND id = ${target.parent_message_id}
          LIMIT 1
        `) as MessageRow | undefined;
        if (!userMessage || userMessage.role !== "user" || !userMessage.content.trim()) {
          throw new ChatHistoryError("无法恢复要重试的问题", 409);
        }
        messages = buildModelHistory(context.rows, userMessage.id);
        messages.push({ role: "user", content: userMessage.content });
        ({ messages, contextLimited } = selectModelContext(messages));
        contextLimited ||= context.hasEarlierMessages;
      } else {
        // Summary retries start a fresh summary generation and never reuse old summary text.
        messages = [];
      }

      assistantMessageId = randomUUID();
      insertMessage(tx, {
        id: assistantMessageId,
        conversationId: conversation.id,
        position: nextMessagePosition(tx, conversation.id),
        role: "assistant",
        content: "",
        status: "pending",
        parentMessageId: target.parent_message_id,
        generationId,
        now
      });
    }

    tx.run(sql`
      UPDATE chat_conversations
      SET repository_path = ${document.repositoryPath},
          active_generation_id = ${generationId},
          active_revision = ${document.revision},
          lease_expires_at = ${now + leaseDurationMs},
          lease_duration_ms = ${leaseDurationMs},
          updated_at = ${now}
      WHERE id = ${conversation.id}
    `);

    const updatedConversation = getConversationById(tx, conversation.id);
    if (!updatedConversation) {
      throw new ChatHistoryError("无法读取新建的聊天记录", 500);
    }

    const latestPage = getHistoryPage(tx, conversation.id);
    return {
      conversationId: conversation.id,
      generationId,
      assistantMessageId,
      messages,
      history: makeHistoryPayload(updatedConversation, latestPage.rows, document, latestPage.hasMore),
      contextLimited
    };
  }, { behavior: "immediate" });
}

export function appendDocumentChatDelta(generation: ChatGeneration, text: string): boolean {
  ensureChatHistorySchema();
  const db = getDb();

  return db.transaction((tx) => {
    const now = Date.now();
    const conversation = getConversationById(tx, generation.conversationId);
    if (!conversation || conversation.active_generation_id !== generation.generationId) {
      return false;
    }

    if (conversation.lease_expires_at === null || conversation.lease_expires_at <= now) {
      recoverExpiredLease(tx, conversation, now);
      return false;
    }

    const message = getAssistantForGeneration(tx, generation.conversationId, generation.generationId);
    if (!message || (message.status !== "pending" && message.status !== "streaming")) {
      return false;
    }

    if (text.length === 0) {
      return true;
    }

    if (message.content.length + text.length > MAX_CHAT_MESSAGE_CHARS) {
      clearConversationLease(tx, generation.conversationId, now, "error", REPLY_LIMIT_MESSAGE);
      return false;
    }

    const leaseDurationMs = conversation.lease_duration_ms ?? 1;
    tx.run(sql`
      UPDATE chat_messages
      SET content = content || ${text}, status = 'streaming', updated_at = ${now}
      WHERE id = ${message.id} AND generation_id = ${generation.generationId}
    `);
    tx.run(sql`
      UPDATE chat_conversations
      SET lease_expires_at = ${now + leaseDurationMs}, updated_at = ${now}
      WHERE id = ${generation.conversationId} AND active_generation_id = ${generation.generationId}
    `);
    return true;
  }, { behavior: "immediate" });
}

export function finishDocumentChatTurn(
  generation: ChatGeneration,
  status: "complete" | "stopped" | "error",
  errorMessage?: string
): void {
  ensureChatHistorySchema();
  const db = getDb();

  db.transaction((tx) => {
    const now = Date.now();
    const conversation = getConversationById(tx, generation.conversationId);
    if (!conversation || conversation.active_generation_id !== generation.generationId) {
      return;
    }

    if (conversation.lease_expires_at === null || conversation.lease_expires_at <= now) {
      recoverExpiredLease(tx, conversation, now);
      return;
    }

    const assistant = getAssistantForGeneration(tx, generation.conversationId, generation.generationId);
    if (!assistant || (assistant.status !== "pending" && assistant.status !== "streaming")) {
      clearConversationLease(tx, generation.conversationId, now, status, errorMessage ?? null);
      return;
    }

    const terminalError = status === "error" ? errorMessage ?? "生成失败" : errorMessage ?? null;
    tx.run(sql`
      UPDATE chat_messages
      SET status = ${status}, error = ${terminalError}, updated_at = ${now}
      WHERE id = ${assistant.id} AND generation_id = ${generation.generationId}
    `);
    tx.run(sql`
      UPDATE chat_conversations
      SET last_revision = CASE WHEN ${status} = 'complete' THEN active_revision ELSE last_revision END,
          active_generation_id = NULL,
          active_revision = NULL,
          lease_expires_at = NULL,
          lease_duration_ms = NULL,
          updated_at = ${now}
      WHERE id = ${generation.conversationId} AND active_generation_id = ${generation.generationId}
    `);
  }, { behavior: "immediate" });
}
