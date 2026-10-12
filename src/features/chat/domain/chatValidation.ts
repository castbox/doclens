import {
  MAX_CHAT_MESSAGE_CHARS,
  MAX_QUESTION_CHARS,
  type ChatRole,
  type ChatTurn,
  type ChatRequest,
  type DocumentChatRequest,
  type StandaloneChatRequest
} from "./types";

const MAX_CHAT_PATH_CHARS = 2_048;
const MAX_RETRY_MESSAGE_ID_CHARS = 128;
const MAX_CONVERSATION_ID_CHARS = 128;
const CHAT_ROLES: ChatRole[] = ["user", "assistant"];

export class ChatValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function parseChatPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ChatValidationError("文档路径不能为空");
  }

  if (value.length > MAX_CHAT_PATH_CHARS) {
    throw new ChatValidationError(`文档路径不能超过 ${MAX_CHAT_PATH_CHARS} 个字符`);
  }

  if (value.includes("\0")) {
    throw new ChatValidationError("文档路径不能包含空字符");
  }

  if (/^[\\/]/.test(value) || /^[a-zA-Z]:/.test(value)) {
    throw new ChatValidationError("文档路径必须是相对路径");
  }

  if (value.split(/[\\/]+/).includes("..")) {
    throw new ChatValidationError("文档路径不能包含 .. 路径段");
  }

  return value;
}

function parseHistoryTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) {
    throw new ChatValidationError("聊天历史必须是数组");
  }

  const messages: ChatTurn[] = [];

  for (const [index, valueMessage] of value.entries()) {
    if (!isRecord(valueMessage) || !hasOwn(valueMessage, "role") || !hasOwn(valueMessage, "content")) {
      throw new ChatValidationError(`第 ${index + 1} 条消息格式不正确`);
    }

    const { role, content } = valueMessage;
    if (typeof role !== "string" || !CHAT_ROLES.includes(role as ChatRole)) {
      throw new ChatValidationError(`第 ${index + 1} 条消息角色无效`);
    }

    if (typeof content !== "string" || !content.trim()) {
      throw new ChatValidationError(`第 ${index + 1} 条消息内容不能为空`);
    }

    if (content.length > MAX_CHAT_MESSAGE_CHARS) {
      throw new ChatValidationError(`单条消息不能超过 ${MAX_CHAT_MESSAGE_CHARS} 个字符`);
    }

    if (role === "user" && content.length > MAX_QUESTION_CHARS) {
      throw new ChatValidationError(`每个问题不能超过 ${MAX_QUESTION_CHARS} 个字符`);
    }

    if (index > 0 && messages[index - 1].role === role) {
      throw new ChatValidationError("聊天记录中的用户和助手消息必须交替出现");
    }

    messages.push({ role: role as ChatRole, content });
  }

  if (messages.length > 0 && messages[messages.length - 1].role !== "user") {
    throw new ChatValidationError("最后一条消息必须来自用户");
  }

  return messages;
}

export function parseDocumentChatRequest(value: unknown): DocumentChatRequest {
  if (!isRecord(value) || !hasOwn(value, "path") || !hasOwn(value, "action")) {
    throw new ChatValidationError("请求必须包含 path 和 action");
  }

  const path = parseChatPath(value.path);
  if (value.action === "summary") {
    return { path, action: "summary" };
  }

  if (value.action === "send") {
    if (!hasOwn(value, "content") || typeof value.content !== "string" || !value.content.trim()) {
      throw new ChatValidationError("问题内容不能为空");
    }

    if (value.content.length > MAX_QUESTION_CHARS) {
      throw new ChatValidationError(`每个问题不能超过 ${MAX_QUESTION_CHARS} 个字符`);
    }

    return { path, action: "send", content: value.content };
  }

  if (value.action === "retry") {
    if (typeof value.messageId !== "string" || !value.messageId.trim()) {
      throw new ChatValidationError("重试消息 ID 不能为空");
    }

    if (value.messageId.length > MAX_RETRY_MESSAGE_ID_CHARS) {
      throw new ChatValidationError(`重试消息 ID 不能超过 ${MAX_RETRY_MESSAGE_ID_CHARS} 个字符`);
    }

    if (value.messageId.includes("\0")) {
      throw new ChatValidationError("重试消息 ID 不能包含空字符");
    }

    return { path, action: "retry", messageId: value.messageId };
  }

  throw new ChatValidationError("聊天操作类型无效");
}

export function parseStandaloneChatRequest(value: unknown): StandaloneChatRequest {
  if (!isRecord(value) || !hasOwn(value, "conversationId") || !hasOwn(value, "action")) {
    throw new ChatValidationError("独立聊天请求必须包含 conversationId 和 action");
  }

  const conversationId = parseChatConversationId(value.conversationId);

  if (value.action === "send") {
    if (!hasExactRequestKeys(value, ["conversationId", "action", "content"])) {
      throw new ChatValidationError("独立聊天请求字段无效");
    }
    if (typeof value.content !== "string" || !value.content.trim()) {
      throw new ChatValidationError("问题内容不能为空");
    }
    if (value.content.length > MAX_QUESTION_CHARS) {
      throw new ChatValidationError(`每个问题不能超过 ${MAX_QUESTION_CHARS} 个字符`);
    }
    return { conversationId, action: "send", content: value.content };
  }

  if (value.action === "retry") {
    if (!hasExactRequestKeys(value, ["conversationId", "action", "messageId"])) {
      throw new ChatValidationError("独立聊天请求字段无效");
    }
    if (
      typeof value.messageId !== "string" ||
      !value.messageId.trim() ||
      value.messageId.length > MAX_RETRY_MESSAGE_ID_CHARS ||
      /[\u0000-\u001f\u007f-\u009f]/.test(value.messageId)
    ) {
      throw new ChatValidationError("重试消息 ID 无效");
    }
    return { conversationId, action: "retry", messageId: value.messageId };
  }

  throw new ChatValidationError("独立聊天不支持该操作");
}

export function parseChatConversationId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_CONVERSATION_ID_CHARS ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new ChatValidationError("聊天会话 ID 无效");
  }
  return value;
}

function hasExactRequestKeys(record: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && expected.every((key) => hasOwn(record, key));
}

export function parseChatRequest(value: unknown): ChatRequest {
  if (!isRecord(value)) {
    throw new ChatValidationError("聊天请求格式无效");
  }
  const hasPath = hasOwn(value, "path");
  const hasConversationId = hasOwn(value, "conversationId");
  if (hasPath === hasConversationId) {
    throw new ChatValidationError("请求必须且只能指定一种聊天会话");
  }
  return hasConversationId ? parseStandaloneChatRequest(value) : parseDocumentChatRequest(value);
}

export function parseChatHistory(messages: unknown): ChatTurn[] {
  return parseHistoryTurns(messages);
}
