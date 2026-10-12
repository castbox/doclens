import { createSseParser } from "@/features/chat/domain/chatStream";
import { parseChatConversationId, parseChatPath, parseChatRequest } from "@/features/chat/domain/chatValidation";
import {
  MAX_CHAT_HISTORY_PAGE_CHARS,
  MAX_CHAT_HISTORY_PAGE_MESSAGES,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_REQUEST_BYTES,
  type ChatHistoryPayload,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatRequest,
  type ChatStreamEvent
} from "@/features/chat/domain/types";

const MAX_RESPONSE_CHARACTERS = MAX_CHAT_MESSAGE_CHARS;
const MAX_ERROR_BODY_BYTES = 32 * 1024;
const MAX_ERROR_MESSAGE_CHARACTERS = 1_000;
const MAX_ID_CHARACTERS = 128;
const MESSAGE_STATUSES = new Set<ChatMessageStatus>(["pending", "streaming", "complete", "stopped", "error"]);

type AbortOptions = {
  signal: AbortSignal;
};

type LoadDocumentChatHistoryOptions = AbortOptions & {
  beforeMessageId?: string;
};

type StreamDocumentChatOptions = AbortOptions & {
  onDelta: (text: string, messageId: string) => void;
  onHistory: (history: ChatHistoryPayload) => void;
};

export class ChatClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatClientError";
    this.status = status;
  }
}

class ChatProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatProtocolError";
  }
}

function abortError(): Error {
  const error = new Error("聊天请求已取消");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

function isJsonContentType(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json") || contentType.includes("+json");
}

function isSafeErrorText(message: string): boolean {
  if (message.length > MAX_ERROR_MESSAGE_CHARACTERS) {
    return false;
  }
  if (/<\/?[a-z][^>]*>/i.test(message)) {
    return false;
  }
  if (/\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+|(?:api[_-]?key|authorization)\s*[:=]\s*\S+)/i.test(message)) {
    return false;
  }
  return true;
}

function boundedErrorText(message: unknown): string | null {
  if (typeof message !== "string" || !isSafeErrorText(message)) {
    return null;
  }
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directError = boundedErrorText(record.error);
  if (directError) {
    return directError;
  }

  if (record.error && typeof record.error === "object" && !Array.isArray(record.error)) {
    const nestedError = boundedErrorText((record.error as Record<string, unknown>).message);
    if (nestedError) {
      return nestedError;
    }
  }

  return boundedErrorText(record.message);
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<string | null> {
  if (signal.aborted) {
    throw abortError();
  }
  if (!response.body) {
    return "";
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw new Error("聊天服务响应无法读取");
  }

  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";
  let aborted = false;
  let reachedEnd = false;

  const onAbort = (): void => {
    aborted = true;
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (aborted || signal.aborted) {
        throw abortError();
      }
      const result = await reader.read();
      if (aborted || signal.aborted) {
        throw abortError();
      }
      if (result.done) {
        reachedEnd = true;
        text += decoder.decode();
        return text;
      }
      byteCount += result.value.byteLength;
      if (byteCount > maxBytes) {
        return null;
      }
      text += decoder.decode(result.value, { stream: true });
    }
  } catch (error) {
    if (isAbortError(error, signal) || aborted) {
      throw abortError();
    }
    throw error instanceof Error ? error : new Error("聊天服务响应读取失败");
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (!reachedEnd) {
      try {
        await reader.cancel();
      } catch {
        // The reader may already be closed or cancelled.
      }
    }
    reader.releaseLock();
  }
}

async function responseErrorMessage(response: Response, signal: AbortSignal): Promise<string> {
  const fallback = `聊天请求失败（HTTP ${response.status}）`;
  if (!isJsonContentType(response)) {
    return fallback;
  }

  let body: string | null;
  try {
    body = await readBoundedText(response, MAX_ERROR_BODY_BYTES, signal);
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw abortError();
    }
    return fallback;
  }
  if (body === null) {
    return fallback;
  }

  try {
    return getErrorMessage(JSON.parse(body) as unknown) ?? fallback;
  } catch {
    return fallback;
  }
}

async function httpError(response: Response, signal: AbortSignal): Promise<ChatClientError> {
  const message = await responseErrorMessage(response, signal);
  if (signal.aborted) {
    throw abortError();
  }
  return new ChatClientError(message, response.status);
}

async function fetchResponse(input: RequestInfo | URL, init: RequestInit, signal: AbortSignal): Promise<Response> {
  if (signal.aborted) {
    throw abortError();
  }
  try {
    const response = await fetch(input, init);
    if (signal.aborted) {
      throw abortError();
    }
    return response;
  } catch (error) {
    if (isAbortError(error, signal)) {
      throw abortError();
    }
    throw new Error("无法连接聊天服务，请稍后重试");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(record);
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(record, key));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_ID_CHARACTERS && !/[\u0000-\u001f\u007f]/.test(value);
}

function parseChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "role", "content", "status", "error"])) {
    return null;
  }
  if (!validId(value.id) || (value.role !== "user" && value.role !== "assistant")) {
    return null;
  }
  if (typeof value.content !== "string" || value.content.length > MAX_CHAT_MESSAGE_CHARS) {
    return null;
  }
  if (typeof value.status !== "string" || !MESSAGE_STATUSES.has(value.status as ChatMessageStatus)) {
    return null;
  }
  if (value.error !== null && (typeof value.error !== "string" || !isSafeErrorText(value.error))) {
    return null;
  }
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    status: value.status as ChatMessageStatus,
    error: value.error as string | null
  };
}

function parseChatHistory(value: unknown): ChatHistoryPayload {
  if (!isRecord(value) || !hasExactKeys(value, ["conversationId", "messages", "isGenerating", "documentChanged", "hasMore"])) {
    throw new ChatProtocolError("聊天历史格式无效");
  }
  if (value.conversationId !== null && !validId(value.conversationId)) {
    throw new ChatProtocolError("聊天历史格式无效");
  }
  if (!Array.isArray(value.messages) || value.messages.length > MAX_CHAT_HISTORY_PAGE_MESSAGES) {
    throw new ChatProtocolError("聊天历史格式无效");
  }
  if (
    typeof value.isGenerating !== "boolean" ||
    typeof value.documentChanged !== "boolean" ||
    typeof value.hasMore !== "boolean"
  ) {
    throw new ChatProtocolError("聊天历史格式无效");
  }

  const messages: ChatMessage[] = [];
  const ids = new Set<string>();
  let totalCharacters = 0;
  for (const item of value.messages) {
    const message = parseChatMessage(item);
    if (!message || ids.has(message.id)) {
      throw new ChatProtocolError("聊天历史格式无效");
    }
    totalCharacters += message.content.length;
    if (totalCharacters > MAX_CHAT_HISTORY_PAGE_CHARS) {
      throw new ChatProtocolError("聊天历史分页超过长度限制");
    }
    ids.add(message.id);
    messages.push(message);
  }

  return {
    conversationId: value.conversationId as string | null,
    messages,
    isGenerating: value.isGenerating,
    documentChanged: value.documentChanged,
    hasMore: value.hasMore
  };
}

export async function loadDocumentChatHistory(
  path: string,
  options: LoadDocumentChatHistoryOptions
): Promise<ChatHistoryPayload> {
  const parsedPath = parseChatPath(path);
  const query = [`path=${encodeURIComponent(parsedPath)}`];
  if (options.beforeMessageId !== undefined) {
    if (!validId(options.beforeMessageId)) {
      throw new Error("聊天历史分页游标无效");
    }
    query.push(`beforeMessageId=${encodeURIComponent(options.beforeMessageId)}`);
  }
  const response = await fetchResponse(
    `/api/chat/history?${query.join("&")}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options.signal
    },
    options.signal
  );

  return readHistoryPayload(response, options.signal);
}

async function readHistoryPayload(response: Response, signal: AbortSignal): Promise<ChatHistoryPayload> {
  if (signal.aborted) throw abortError();
  if (!response.ok) throw await httpError(response, signal);
  if (!isJsonContentType(response)) throw new Error("聊天历史响应格式无效");

  let body: string | null;
  try {
    body = await readBoundedText(response, MAX_CHAT_REQUEST_BYTES, signal);
  } catch (error) {
    if (isAbortError(error, signal)) throw abortError();
    throw new Error("聊天历史读取失败");
  }
  if (signal.aborted) throw abortError();
  if (body === null) throw new Error("聊天历史响应过大");

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("聊天历史格式无效");
  }
  return parseChatHistory(value);
}

export async function createStandaloneChat(options: AbortOptions): Promise<ChatHistoryPayload> {
  const response = await fetchResponse(
    "/api/chat/conversations",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options.signal
    },
    options.signal
  );
  const history = await readHistoryPayload(response, options.signal);
  if (
    !validId(history.conversationId) ||
    history.messages.length !== 0 ||
    history.isGenerating ||
    history.documentChanged ||
    history.hasMore
  ) {
    throw new ChatProtocolError("新建聊天会话响应格式无效");
  }
  return history;
}

export async function loadStandaloneChatHistory(
  inputConversationId: string,
  options: LoadDocumentChatHistoryOptions
): Promise<ChatHistoryPayload> {
  const conversationId = parseChatConversationId(inputConversationId);
  const query = [`conversationId=${encodeURIComponent(conversationId)}`];
  if (options.beforeMessageId !== undefined) {
    if (!validId(options.beforeMessageId)) {
      throw new Error("聊天历史分页游标无效");
    }
    query.push(`beforeMessageId=${encodeURIComponent(options.beforeMessageId)}`);
  }
  const response = await fetchResponse(
    `/api/chat/history?${query.join("&")}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: options.signal
    },
    options.signal
  );
  const history = await readHistoryPayload(response, options.signal);
  if (history.conversationId !== conversationId) {
    throw new ChatProtocolError("聊天历史会话 ID 不匹配");
  }
  return history;
}

function parseChatEvent(data: string): ChatStreamEvent {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new ChatProtocolError("聊天服务返回了无法识别的数据");
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new ChatProtocolError("聊天服务返回了无效事件");
  }

  if (value.type === "history" && hasExactKeys(value, ["type", "history"])) {
    return { type: "history", history: parseChatHistory(value.history) };
  }
  if (value.type === "delta" && hasExactKeys(value, ["type", "messageId", "text"]) && validId(value.messageId) && typeof value.text === "string") {
    return { type: "delta", messageId: value.messageId, text: value.text };
  }
  if (value.type === "error" && (hasExactKeys(value, ["type", "message"]) || hasExactKeys(value, ["type", "message", "history"]))) {
    const message = boundedErrorText(value.message) ?? "聊天服务发生错误，请稍后重试";
    if (Object.hasOwn(value, "history")) {
      return { type: "error", message, history: parseChatHistory(value.history) };
    }
    return { type: "error", message };
  }
  if (value.type === "done" && hasExactKeys(value, ["type", "history"])) {
    return { type: "done", history: parseChatHistory(value.history) };
  }

  throw new ChatProtocolError("聊天服务返回了无效事件");
}

export async function streamDocumentChat(
  request: ChatRequest,
  options: StreamDocumentChatOptions
): Promise<void> {
  const parsedRequest = parseChatRequest(request);
  const expectedConversationId = "conversationId" in parsedRequest ? parsedRequest.conversationId : null;
  const response = await fetchResponse(
    "/api/chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify(parsedRequest),
      signal: options.signal
    },
    options.signal
  );

  if (options.signal.aborted) {
    throw abortError();
  }

  if (!response.ok) {
    throw await httpError(response, options.signal);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/event-stream")) {
    if (isJsonContentType(response)) {
      throw await httpError(response, options.signal);
    }
    throw new Error("聊天服务没有返回有效的流式响应");
  }
  if (!response.body) {
    throw new Error("聊天服务未提供可读取的响应流");
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw new Error("聊天服务响应流无法读取");
  }

  const decoder = new TextDecoder();
  const responseCharactersByMessage = new Map<string, number>();
  let complete = false;
  let eventError: Error | null = null;
  let abortRequested = false;

  const parser = createSseParser((data) => {
    if (complete || eventError) {
      return;
    }

    const event = parseChatEvent(data);
    if (
      expectedConversationId &&
      ((event.type === "history" || event.type === "done") && event.history.conversationId !== expectedConversationId ||
        event.type === "error" && event.history && event.history.conversationId !== expectedConversationId)
    ) {
      eventError = new ChatProtocolError("聊天流会话 ID 不匹配");
      return;
    }
    if (event.type === "history") {
      options.onHistory(event.history);
      return;
    }
    if (event.type === "done") {
      options.onHistory(event.history);
      complete = true;
      return;
    }
    if (event.type === "error") {
      if (event.history) {
        options.onHistory(event.history);
      }
      eventError = new ChatProtocolError(event.message);
      return;
    }

    if (event.text.length === 0) {
      return;
    }

    const currentCharacters = responseCharactersByMessage.get(event.messageId) ?? 0;
    const remaining = MAX_RESPONSE_CHARACTERS - currentCharacters;
    if (event.text.length > remaining) {
      if (remaining > 0) {
        options.onDelta(event.text.slice(0, remaining), event.messageId);
        responseCharactersByMessage.set(event.messageId, MAX_RESPONSE_CHARACTERS);
      }
      eventError = new ChatProtocolError("回复内容超过 32,000 个字符，已停止接收");
      return;
    }

    responseCharactersByMessage.set(event.messageId, currentCharacters + event.text.length);
    options.onDelta(event.text, event.messageId);
  });

  const onAbort = (): void => {
    abortRequested = true;
    void reader.cancel().catch(() => undefined);
  };
  options.signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (abortRequested || options.signal.aborted) {
        throw abortError();
      }
      const result = await reader.read();
      if (abortRequested || options.signal.aborted) {
        throw abortError();
      }
      if (result.done) {
        parser.push(decoder.decode());
        parser.finish();
        if (eventError) {
          throw eventError;
        }
        if (!complete) {
          throw new ChatProtocolError("聊天响应意外结束，请重试");
        }
        return;
      }

      parser.push(decoder.decode(result.value, { stream: true }));
      if (eventError) {
        throw eventError;
      }
      if (complete) {
        return;
      }
    }
  } catch (error) {
    if (isAbortError(error, options.signal) || abortRequested) {
      throw abortError();
    }
    if (error instanceof ChatProtocolError) {
      throw error;
    }
    throw new Error("读取聊天响应失败，请稍后重试");
  } finally {
    options.signal.removeEventListener("abort", onAbort);
    try {
      await reader.cancel();
    } catch {
      // The reader may already be closed or cancelled.
    }
    reader.releaseLock();
  }
}
