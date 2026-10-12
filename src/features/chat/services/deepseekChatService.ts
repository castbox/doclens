import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildDocumentChatMessages, buildStandaloneChatMessages } from "@/features/chat/domain/chatPrompts";
import { parseChatConversationId, parseChatPath, parseChatRequest, ChatValidationError } from "@/features/chat/domain/chatValidation";
import { detectPreviewKind } from "@/features/docs/domain/fileType";
import {
  MAX_CHAT_DOCUMENT_BYTES,
  MAX_CHAT_DOCUMENT_CHARS,
  MAX_CHAT_MESSAGE_CHARS,
  type ChatDocumentIdentity,
  type ChatGeneration,
  type ChatHistoryPayload,
  type ChatRequest,
  type ChatStreamEvent,
  type DocumentChatRequest,
  type StandaloneChatIdentity,
  type StandaloneChatRequest
} from "@/features/chat/domain/types";
import { resolveDocsPath, PathSecurityError } from "@/features/docs/domain/pathRules";
import { readFilePreview } from "@/features/docs/services/docsFsService";
import { getConfig } from "@/shared/utils/env";
import { createSseParser } from "@/features/chat/domain/chatStream";
import { ChatConfigurationError, getChatConfig } from "./chatConfig";
import {
  appendDocumentChatDelta,
  beginDocumentChatTurn,
  beginStandaloneChatTurn,
  ChatHistoryError,
  createStandaloneChatConversation as createStandaloneChatConversationInRepo,
  ensureChatHistorySchema,
  finishDocumentChatTurn,
  getStandaloneChatHistory,
  getDocumentChatHistory
} from "./chatHistoryRepo";

export class ChatServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatServiceError";
    this.status = status;
  }
}

type SafeDocumentLocation = {
  docsRoot: string;
  relativePath: string;
  readPath: string;
  repositoryPath: string;
  canonicalPath: string;
  size: number;
  modifiedAt: string;
  modifiedAtMs: number;
};

const textEncoder = new TextEncoder();
const MAX_COMPLETION_TOKENS = 4_096;

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertCanonicalPathIsNotIgnored(root: string, target: string): void {
  const relativePath = path.relative(root, target).split(path.sep).join("/");
  const ignored = new Set(getConfig().searchIgnore);
  if (relativePath.split("/").some((segment) => ignored.has(segment))) {
    throw new ChatServiceError("文档路径无效或当前不可访问。", 400);
  }
}

async function locateSafeDocument(inputPath: string): Promise<SafeDocumentLocation> {
  let resolved: ReturnType<typeof resolveDocsPath>;
  try {
    resolved = resolveDocsPath(inputPath);
  } catch (error) {
    if (error instanceof PathSecurityError) {
      throw new ChatServiceError("文档路径无效或当前不可访问。", 400);
    }
    throw new ChatServiceError("文档路径无效或当前不可访问。", 400);
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = await fs.realpath(resolved.docsRoot);
  } catch {
    throw new ChatServiceError("文档目录暂不可用。", 503);
  }

  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(resolved.absolutePath);
  } catch {
    throw new ChatServiceError("找不到该文档或无法读取。", 404);
  }

  if (!isWithinRoot(canonicalRoot, canonicalPath)) {
    throw new ChatServiceError("文档路径无效或当前不可访问。", 400);
  }

  assertCanonicalPathIsNotIgnored(canonicalRoot, canonicalPath);

  const canonicalRelativePath = path.relative(canonicalRoot, canonicalPath).split(path.sep).join("/");
  const { docsRootMode } = getConfig();
  const canonicalRepositoryPath = docsRootMode === "docs-directory"
    ? canonicalRelativePath ? `docs/${canonicalRelativePath}` : "docs"
    : canonicalRelativePath || ".";
  const previewPath = docsRootMode === "docs-directory" &&
    (resolved.relativePath === "docs" || resolved.relativePath.startsWith("docs/"))
    ? `docs/${resolved.relativePath}`
    : resolved.relativePath;

  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(canonicalPath);
  } catch {
    throw new ChatServiceError("找不到该文档或无法读取。", 404);
  }

  if (!stats.isFile()) {
    throw new ChatServiceError("当前路径不是可读取的文档。", 400);
  }

  if (stats.size > MAX_CHAT_DOCUMENT_BYTES) {
    throw new ChatServiceError("文档大小不能超过 512 KB。", 413);
  }

  return {
    docsRoot: canonicalRoot,
    relativePath: canonicalRelativePath,
    readPath: previewPath,
    repositoryPath: canonicalRepositoryPath,
    canonicalPath,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    modifiedAtMs: stats.mtimeMs
  };
}

function assertSameDocument(before: SafeDocumentLocation, after: SafeDocumentLocation): void {
  if (
    before.docsRoot !== after.docsRoot ||
    before.canonicalPath !== after.canonicalPath ||
    before.relativePath !== after.relativePath ||
    before.readPath !== after.readPath ||
    before.repositoryPath !== after.repositoryPath
  ) {
    throw new ChatServiceError("文档路径在读取期间发生变化，请重新打开后重试。", 409);
  }

  if (before.size !== after.size || before.modifiedAtMs !== after.modifiedAtMs) {
    throw new ChatServiceError("文档在读取期间发生变化，请重新打开后重试。", 409);
  }
}

async function readDocumentContext(inputPath: string): Promise<{ identity: ChatDocumentIdentity; content: string; location: SafeDocumentLocation }> {
  const beforeRead = await locateSafeDocument(inputPath);
  const fileKind = detectPreviewKind(path.basename(beforeRead.relativePath));
  if (fileKind === "pdf" || fileKind === "binary") {
    throw new ChatServiceError("当前聊天仅支持文本类文档，PDF 或二进制文件无法发送给模型。", 415);
  }

  let preview: Awaited<ReturnType<typeof readFilePreview>>;
  try {
    preview = await readFilePreview(beforeRead.readPath, { fullContent: true });
  } catch {
    throw new ChatServiceError("读取当前文档失败。", 500);
  }

  const beforePrompt = await locateSafeDocument(inputPath);
  assertSameDocument(beforeRead, beforePrompt);

  if (preview.size > MAX_CHAT_DOCUMENT_BYTES || preview.truncated) {
    throw new ChatServiceError("文档大小不能超过 512 KB。", 413);
  }

  if (preview.kind === "pdf" || preview.kind === "binary") {
    throw new ChatServiceError("当前聊天仅支持文本类文档，PDF 或二进制文件无法发送给模型。", 415);
  }

  if (typeof preview.content !== "string" || !preview.content.trim()) {
    throw new ChatServiceError("当前文档没有可供聊天的文本内容。", 422);
  }

  if (preview.content.length > MAX_CHAT_DOCUMENT_CHARS) {
    throw new ChatServiceError("文档文本不能超过 100000 个字符。", 413);
  }

  if (preview.size !== beforePrompt.size || preview.modifiedAt !== beforePrompt.modifiedAt) {
    throw new ChatServiceError("文档在读取期间发生变化，请重新打开后重试。", 409);
  }

  return {
    identity: {
      docsRoot: beforePrompt.docsRoot,
      path: beforePrompt.relativePath,
      repositoryPath: beforePrompt.repositoryPath,
      revision: createHash("sha256").update(preview.content, "utf8").digest("hex")
    },
    content: preview.content,
    location: beforePrompt
  };
}

function completionEndpoint(baseUrl: string): string {
  return `${baseUrl}/chat/completions`;
}

function mapUpstreamHttpError(status: number): ChatServiceError {
  if (status === 401 || status === 403) {
    return new ChatServiceError("DeepSeek API 密钥无效或当前服务无权访问，请联系管理员检查配置。", 502);
  }
  if (status === 429) {
    return new ChatServiceError("DeepSeek 当前请求过于频繁，请稍后重试。", 429);
  }
  if (status >= 500) {
    return new ChatServiceError("DeepSeek 服务暂时不可用，请稍后重试。", 503);
  }
  return new ChatServiceError("DeepSeek 请求失败，请稍后重试。", 502);
}

function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return textEncoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function mapConfigurationError(error: unknown): ChatServiceError {
  if (error instanceof ChatConfigurationError) {
    return new ChatServiceError(error.message, 503);
  }
  return new ChatServiceError("聊天服务配置暂不可用。", 503);
}

function mapHistoryError(error: unknown, cursorConflict = false): ChatServiceError {
  if (error instanceof ChatHistoryError) {
    if (cursorConflict && error.status === 400) {
      return new ChatServiceError("聊天记录状态已变化，请刷新后重试。", 409);
    }
    return new ChatServiceError(error.message, error.status);
  }
  return new ChatServiceError("聊天历史暂不可用，请稍后重试。", 503);
}

function readCurrentHistory(document: ChatDocumentIdentity): ChatHistoryPayload | null {
  try {
    return getDocumentChatHistory(document);
  } catch {
    return null;
  }
}

function readCurrentStandaloneHistory(identity: StandaloneChatIdentity): ChatHistoryPayload | null {
  try {
    return getStandaloneChatHistory(identity);
  } catch {
    return null;
  }
}

async function getCanonicalDocsRoot(): Promise<string> {
  try {
    return await fs.realpath(getConfig().docsRoot);
  } catch {
    throw new ChatServiceError("文档目录暂不可用。", 503);
  }
}

export async function createStandaloneChatConversation(): Promise<ChatHistoryPayload> {
  const docsRoot = await getCanonicalDocsRoot();
  try {
    return createStandaloneChatConversationInRepo(docsRoot);
  } catch (error) {
    throw mapHistoryError(error);
  }
}

export async function readStandaloneChatHistory(
  inputConversationId: string,
  beforeMessageId?: string
): Promise<ChatHistoryPayload> {
  let conversationId: string;
  try {
    conversationId = parseChatConversationId(inputConversationId);
  } catch (error) {
    if (error instanceof ChatValidationError) throw new ChatServiceError(error.message, 400);
    throw new ChatServiceError("聊天会话 ID 无效。", 400);
  }

  if (
    beforeMessageId !== undefined &&
    (
      !beforeMessageId.trim() ||
      beforeMessageId.length > 128 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(beforeMessageId)
    )
  ) {
    throw new ChatServiceError("历史记录游标无效。", 400);
  }

  const docsRoot = await getCanonicalDocsRoot();
  try {
    return getStandaloneChatHistory({ docsRoot, conversationId }, beforeMessageId);
  } catch (error) {
    throw mapHistoryError(error, beforeMessageId !== undefined);
  }
}

export async function readDocumentChatHistory(inputPath: string, beforeMessageId?: string): Promise<ChatHistoryPayload> {
  let safePath: string;
  try {
    safePath = parseChatPath(inputPath);
  } catch (error) {
    if (error instanceof ChatValidationError) {
      throw new ChatServiceError(error.message, 400);
    }
    throw new ChatServiceError("文档路径无效或当前不可访问。", 400);
  }

  if (
    beforeMessageId !== undefined &&
    (
      typeof beforeMessageId !== "string" ||
      !beforeMessageId.trim() ||
      beforeMessageId.length > 128 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(beforeMessageId)
    )
  ) {
    throw new ChatServiceError("历史记录游标无效。", 400);
  }

  let document: Awaited<ReturnType<typeof readDocumentContext>>;
  try {
    document = await readDocumentContext(safePath);
    const latestLocation = await locateSafeDocument(safePath);
    assertSameDocument(document.location, latestLocation);
    ensureChatHistorySchema();
  } catch (error) {
    if (error instanceof ChatServiceError) throw error;
    throw mapHistoryError(error);
  }

  try {
    return getDocumentChatHistory(document.identity, beforeMessageId);
  } catch (error) {
    throw mapHistoryError(error, beforeMessageId !== undefined);
  }
}

export async function openChat(request: ChatRequest, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  let parsedRequest: ChatRequest;
  try {
    parsedRequest = parseChatRequest(request);
  } catch (error) {
    if (error instanceof ChatValidationError) {
      throw new ChatServiceError(error.message, 400);
    }
    throw new ChatServiceError("聊天请求格式无效。", 400);
  }

  if (signal.aborted) {
    throw new ChatServiceError("聊天请求已取消。", 499);
  }

  const isStandalone = "conversationId" in parsedRequest;
  let documentContext: Awaited<ReturnType<typeof readDocumentContext>> | null = null;
  let standaloneIdentity: StandaloneChatIdentity | null = null;
  let readHistory: () => ChatHistoryPayload | null;
  if (isStandalone) {
    const docsRoot = await getCanonicalDocsRoot();
    const standaloneRequest = parsedRequest as StandaloneChatRequest;
    standaloneIdentity = { docsRoot, conversationId: standaloneRequest.conversationId };
    try {
      getStandaloneChatHistory(standaloneIdentity);
      ensureChatHistorySchema();
    } catch (error) {
      throw mapHistoryError(error);
    }
    readHistory = () => readCurrentStandaloneHistory(standaloneIdentity!);
  } else {
    const documentRequest = parsedRequest as DocumentChatRequest;
    try {
      documentContext = await readDocumentContext(documentRequest.path);
      const latestLocation = await locateSafeDocument(documentRequest.path);
      assertSameDocument(documentContext.location, latestLocation);
      ensureChatHistorySchema();
    } catch (error) {
      if (error instanceof ChatServiceError) throw error;
      throw mapHistoryError(error);
    }
    readHistory = () => readCurrentHistory(documentContext!.identity);
  }

  let chatConfig: ReturnType<typeof getChatConfig>;
  try {
    chatConfig = getChatConfig();
  } catch (error) {
    throw mapConfigurationError(error);
  }

  if (signal.aborted) {
    throw new ChatServiceError("聊天请求已取消。", 499);
  }

  let generation: ChatGeneration;
  try {
    generation = isStandalone
      ? beginStandaloneChatTurn(standaloneIdentity!, parsedRequest as StandaloneChatRequest, chatConfig.timeoutMs + 30_000)
      : beginDocumentChatTurn(documentContext!.identity, parsedRequest as DocumentChatRequest, chatConfig.timeoutMs + 30_000);
  } catch (error) {
    throw mapHistoryError(error);
  }

  if (signal.aborted) {
    try {
      finishDocumentChatTurn(generation, "stopped");
    } catch {
      // Preserve the original cancellation result without exposing repository details.
    }
    throw new ChatServiceError("聊天请求已取消。", 499);
  }

  let messages: ReturnType<typeof buildDocumentChatMessages>;
  try {
    messages = documentContext
      ? buildDocumentChatMessages(
          generation.messages,
          {
            path: documentContext.identity.repositoryPath,
            content: documentContext.content,
            revision: documentContext.identity.revision
          },
          {
            documentChanged: generation.history.documentChanged,
            historyTruncated: generation.contextLimited ?? false
          }
        )
      : buildStandaloneChatMessages(generation.messages, { historyTruncated: generation.contextLimited ?? false });
  } catch {
    try {
      finishDocumentChatTurn(generation, "error", "无法准备当前文档的聊天上下文。");
    } catch {
      // The chat context error is already safe for the route response.
    }
    throw new ChatServiceError(documentContext ? "无法准备当前文档的聊天上下文。" : "无法准备聊天上下文。", 500);
  }

  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let requestAborted = false;
  let streamCancelled = false;
  let cleanedUp = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let outputController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let responseText = "";
  let completed = false;
  let terminalError: string | null = null;
  let terminalSent = false;
  let emittedThisPull = false;
  let generationFinished = false;
  let finishPromise: Promise<ChatHistoryPayload | null> | null = null;
  let fenced = false;
  let abortActiveStream = (): void => undefined;
  let timeoutActiveStream = (): void => undefined;

  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortFromRequest);
    signal.removeEventListener("abort", abortActiveStream);
  };

  const finishGeneration = (status: "complete" | "stopped" | "error", errorMessage?: string): Promise<ChatHistoryPayload | null> => {
    if (finishPromise) return finishPromise;
    if (generationFinished) return Promise.resolve(readHistory());

    finishPromise = Promise.resolve().then(() => {
      try {
        finishDocumentChatTurn(generation, status, errorMessage);
        generationFinished = true;
        const history = readHistory();
        if (status === "complete" && !history?.messages.some((message) => message.id === generation.assistantMessageId && message.status === "complete")) {
          fenced = true;
        }
        return history;
      } catch {
        generationFinished = true;
        if (status === "complete") fenced = true;
        return readHistory();
      }
    });
    return finishPromise;
  };

  const abortFromRequest = (): void => {
    requestAborted = true;
    abortController.abort();
  };

  signal.addEventListener("abort", abortFromRequest, { once: true });
  if (signal.aborted) {
    abortFromRequest();
    await finishGeneration("stopped");
    cleanup();
    throw new ChatServiceError("聊天请求已取消。", 499);
  }
  timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
    timeoutActiveStream();
  }, chatConfig.timeoutMs);

  let response: Response;
  try {
    response = await fetch(completionEndpoint(chatConfig.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chatConfig.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify({
        model: chatConfig.model,
        messages,
        stream: true,
        max_tokens: MAX_COMPLETION_TOKENS,
        thinking: { type: "disabled" }
      }),
      signal: abortController.signal
    });
  } catch {
    cleanup();
    if (requestAborted || signal.aborted) {
      await finishGeneration("stopped");
      throw new ChatServiceError("聊天请求已取消。", 499);
    }
    const serviceError = timedOut
      ? new ChatServiceError("连接 DeepSeek 超时，请稍后重试。", 504)
      : new ChatServiceError("无法连接 DeepSeek 服务，请稍后重试。", 502);
    await finishGeneration("error", serviceError.message);
    throw serviceError;
  }

  if (requestAborted || signal.aborted) {
    try {
      await response.body?.cancel();
    } catch {
      // 上游响应体会被丢弃。
    }
    cleanup();
    await finishGeneration("stopped");
    throw new ChatServiceError("聊天请求已取消。", 499);
  }
  if (timedOut) {
    try {
      await response.body?.cancel();
    } catch {
      // 上游响应体会被丢弃。
    }
    cleanup();
    const serviceError = new ChatServiceError("连接 DeepSeek 超时，请稍后重试。", 504);
    await finishGeneration("error", serviceError.message);
    throw serviceError;
  }

  if (!response.ok) {
    try {
      await response.body?.cancel();
    } catch {
      // 不读取或记录上游错误正文，避免泄露服务端信息。
    }
    cleanup();
    const serviceError = mapUpstreamHttpError(response.status);
    await finishGeneration("error", serviceError.message);
    throw serviceError;
  }

  if (!response.body) {
    cleanup();
    const serviceError = new ChatServiceError("DeepSeek 未返回可读取的聊天流。", 502);
    await finishGeneration("error", serviceError.message);
    throw serviceError;
  }

  reader = response.body.getReader();
  const decoder = new TextDecoder();

  const emit = (event: ChatStreamEvent, force = false): void => {
    if (!outputController || streamCancelled || (terminalSent && !force)) return;
    try {
      outputController.enqueue(encodeEvent(event));
      emittedThisPull = true;
    } catch {
      streamCancelled = true;
      abortController.abort();
    }
  };

  const cancelReader = async (): Promise<void> => {
    const activeReader = reader;
    if (!activeReader) return;
    reader = null;
    try {
      await activeReader.cancel();
    } catch {
      // 下游停止或上游结束后，取消上游 reader 仅作尽力清理。
    }
    try {
      activeReader.releaseLock();
    } catch {
      // Abort 处理中可能暂时仍有挂起的 read。
    }
  };

  const closeOutput = (): void => {
    if (!outputController) return;
    try {
      outputController.close();
    } catch {
      // 下游可能已取消 reader。
    }
  };

  const finishWithError = async (message: string): Promise<void> => {
    if (terminalSent || streamCancelled) return;
    terminalSent = true;
    const history = fenced
      ? readHistory()
      : await finishGeneration("error", message);
    await cancelReader();
    cleanup();
    emit({ type: "error", message, history: history ?? undefined }, true);
    closeOutput();
  };
  timeoutActiveStream = () => {
    if (outputController && !terminalSent) {
      void finishWithError("DeepSeek 响应超时，请稍后重试。");
    }
  };

  const finishSuccessfully = async (): Promise<void> => {
    if (terminalSent || streamCancelled) return;
    terminalSent = true;
    const history = await finishGeneration("complete");
    await cancelReader();
    cleanup();
    if (history && !fenced) {
      emit({ type: "done", history }, true);
    } else {
      emit({
        type: "error",
        message: "当前会话已结束或被其他请求接管，回复已停止。",
        history: history ?? undefined
      }, true);
    }
    closeOutput();
  };

  const finishStopped = async (): Promise<void> => {
    if (terminalSent) return;
    terminalSent = true;
    abortController.abort();
    await finishGeneration("stopped");
    await cancelReader();
    cleanup();
    closeOutput();
  };

  const parser = createSseParser((data) => {
    if (terminalError || completed || terminalSent || streamCancelled) return;
    if (data.trim() === "[DONE]") {
      if (responseText.trim()) {
        completed = true;
      } else {
        terminalError = "DeepSeek 返回了空回复，请稍后重试。";
      }
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      terminalError = "DeepSeek 返回了无法识别的聊天数据，请稍后重试。";
      return;
    }

    if (!payload || typeof payload !== "object") {
      terminalError = "DeepSeek 返回了无法识别的聊天数据，请稍后重试。";
      return;
    }

    const record = payload as Record<string, unknown>;
    if (record.error) {
      terminalError = "DeepSeek 暂时无法生成回复，请稍后重试。";
      return;
    }

    const choices = record.choices;
    if (!Array.isArray(choices) || choices.length === 0 || !choices[0] || typeof choices[0] !== "object") {
      return;
    }

    const choice = choices[0] as Record<string, unknown>;
    const delta = choice.delta;
    if (delta && typeof delta === "object") {
      const content = (delta as Record<string, unknown>).content;
      if (typeof content === "string" && content.length > 0) {
        if (responseText.length + content.length > MAX_CHAT_MESSAGE_CHARS) {
          terminalError = "回复超过单条消息的 32000 字符上限，请缩小问题后重试。";
          return;
        }

        let appended: boolean;
        try {
          appended = appendDocumentChatDelta(generation, content);
        } catch {
          terminalError = "保存聊天回复失败，请稍后重试。";
          return;
        }
        if (!appended) {
          fenced = true;
          terminalError = "当前会话已结束或被其他请求接管，回复已停止。";
          return;
        }

        responseText += content;
        emit({ type: "delta", messageId: generation.assistantMessageId, text: content });
      }
    }

    if (choice.finish_reason === "length") {
      terminalError = "回复达到模型输出长度上限，请缩小问题后重试。";
    } else if (choice.finish_reason === "stop") {
      if (responseText.trim()) {
        completed = true;
      } else {
        terminalError = "DeepSeek 返回了空回复，请稍后重试。";
      }
    } else if (typeof choice.finish_reason === "string" && choice.finish_reason !== "") {
      terminalError = "DeepSeek 未能生成完整回复，请调整问题后重试。";
    }
  });

  abortActiveStream = (): void => {
    if (!outputController || terminalSent) return;
    void finishStopped();
  };
  signal.addEventListener("abort", abortActiveStream, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      outputController = controller;
      try {
        controller.enqueue(encodeEvent({ type: "history", history: generation.history }));
      } catch {
        streamCancelled = true;
        abortController.abort();
      }
    },
    async pull() {
      if (terminalSent || streamCancelled || !reader) return;
      emittedThisPull = false;

      while (!terminalSent && !streamCancelled) {
        const activeReader = reader;
        if (!activeReader) return;

        try {
          const result = await activeReader.read();
          if (result.done) {
            const tail = decoder.decode();
            if (tail) parser.push(tail);
            parser.finish();

            if (requestAborted || signal.aborted) {
              await finishStopped();
            } else if (timedOut) {
              await finishWithError("DeepSeek 响应超时，请稍后重试。");
            } else if (terminalError) {
              await finishWithError(terminalError);
            } else if (completed) {
              await finishSuccessfully();
            } else {
              await finishWithError("DeepSeek 连接提前结束，未收到完整回复。");
            }
            return;
          }

          parser.push(decoder.decode(result.value, { stream: true }));

          if (requestAborted || signal.aborted) {
            await finishStopped();
            return;
          }
          if (timedOut) {
            await finishWithError("DeepSeek 响应超时，请稍后重试。");
            return;
          }
          if (terminalError) {
            await finishWithError(terminalError);
            return;
          }
          if (completed) {
            await finishSuccessfully();
            return;
          }

          // 上游可能先发送 role-only、注释帧或被拆开的 SSE/UTF-8 片段。
          // 本次 pull 尚无可交付事件时继续读取，避免下游永远等不到下一个 pull。
          if (emittedThisPull) return;
        } catch {
          if (requestAborted || signal.aborted || streamCancelled) {
            await finishStopped();
          } else if (timedOut) {
            await finishWithError("DeepSeek 响应超时，请稍后重试。");
          } else {
            await finishWithError("读取 DeepSeek 回复失败，请稍后重试。");
          }
          return;
        }
      }
    },
    async cancel(reason) {
      if (terminalSent) return;
      streamCancelled = true;
      abortController.abort(reason);
      await finishGeneration("stopped");
      await cancelReader();
      cleanup();
    }
  });

  return stream;
}

export function openDocumentChat(request: DocumentChatRequest, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  return openChat(request, signal);
}

export function openStandaloneChat(request: StandaloneChatRequest, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  return openChat(request, signal);
}
