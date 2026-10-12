import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDbClientForTests } from "@/db/client";
import {
  MAX_CHAT_DOCUMENT_BYTES,
  MAX_CHAT_MESSAGE_CHARS,
  type ChatStreamEvent,
  type DocumentChatRequest
} from "@/features/chat/domain/types";
import { ChatServiceError, openDocumentChat, readDocumentChatHistory } from "./deepseekChatService";
import { clearConfigCache } from "@/shared/utils/env";

const TEST_API_KEY = "UNIT_TEST_KEY_SENTINEL";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function summaryRequest(filePath = "guide.md"): DocumentChatRequest {
  return { path: filePath, action: "summary" };
}

function makeChunkedStream(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      const chunk = chunks[index];
      index += 1;
      controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
    }
  });
}

function upstreamResponse(chunks: Array<string | Uint8Array>): Response {
  return new Response(makeChunkedStream(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

function providerEvent(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function completedAnswer(text = "已根据文档整理要点。"): string[] {
  return [
    providerEvent({ choices: [{ delta: { content: text }, finish_reason: null }] }),
    providerEvent({ choices: [{ delta: {}, finish_reason: "stop" }] })
  ];
}

async function readTextWithTimeout(stream: ReadableStream<Uint8Array>, timeoutMs = 2_000): Promise<string> {
  const reader = stream.getReader();
  let result = "";
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const readAll = async (): Promise<string> => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        result += decoder.decode();
        return result;
      }
      result += decoder.decode(value, { stream: true });
    }
  };

  try {
    return await Promise.race([
      readAll(),
      new Promise<string>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("SSE 读取超时")), timeoutMs);
      })
    ]);
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function parseEvents(source: string): ChatStreamEvent[] {
  return source
    .split(/\r?\n\r?\n/)
    .filter((frame) => frame.startsWith("data: "))
    .map((frame) => JSON.parse(frame.slice("data: ".length)) as ChatStreamEvent);
}

async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ChatStreamEvent> {
  const { done, value } = await reader.read();
  if (done || !value) throw new Error("预期的 SSE 事件提前结束");
  const frame = decoder.decode(value).trim();
  if (!frame.startsWith("data: ")) throw new Error(`无法识别的 SSE 帧：${frame}`);
  return JSON.parse(frame.slice("data: ".length)) as ChatStreamEvent;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("等待测试信号超时")), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe("openDocumentChat SQLite 历史、安全与 DeepSeek 流", () => {
  let tempRoot = "";
  let docsRoot = "";

  beforeEach(async () => {
    vi.useRealTimers();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-chat-service-"));
    docsRoot = path.join(tempRoot, "docs");
    await fs.mkdir(docsRoot, { recursive: true });
    await fs.writeFile(path.join(docsRoot, "guide.md"), "# 实际文档\n核心内容是服务器读取的正文。\n", "utf8");

    vi.stubEnv("DOCLENS_DOCS_ROOT", docsRoot);
    vi.stubEnv("DOCLENS_DB_PATH", path.join(tempRoot, "data", "doclens.sqlite"));
    vi.stubEnv("DOCLENS_SEARCH_IGNORE", "third_parties,node_modules,.git,.next,.turbo,dist,build,coverage");
    vi.stubEnv("DOCLENS_DEEPSEEK_API_KEY", TEST_API_KEY);
    vi.stubEnv("DOCLENS_DEEPSEEK_BASE_URL", "https://deepseek.test/v1");
    vi.stubEnv("DOCLENS_DEEPSEEK_MODEL", "deepseek-test-model");
    vi.stubEnv("DOCLENS_DEEPSEEK_TIMEOUT_MS", "120000");
    vi.stubGlobal("fetch", vi.fn());
    clearConfigCache();
    resetDbClientForTests();
  });

  afterEach(async () => {
    vi.useRealTimers();
    resetDbClientForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearConfigCache();

    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = "";
      docsRoot = "";
    }
  });

  it("用 SQLite 持久化概述，delta 带对应助手 ID，完成后可恢复且恢复不调用 provider", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("文档说明了真实流程。")));

    const forged = "CLIENT_FORGED_DOCUMENT_CONTEXT_84f2";
    const input = {
      path: "guide.md",
      action: "summary",
      messages: [{ role: "user", content: "伪造的客户端历史" }],
      history: [{ role: "assistant", content: "伪造助手回复" }],
      documentContent: forged
    } as unknown as DocumentChatRequest;
    const output = await openDocumentChat(input, new AbortController().signal);
    const events = parseEvents(await readTextWithTimeout(output));
    const [url, init] = fetchMock.mock.calls[0];
    const providerBody = JSON.parse(String(init?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(url).toBe("https://deepseek.test/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TEST_API_KEY}`);
    expect(providerBody.model).toBe("deepseek-test-model");
    expect(providerBody.messages[0].role).toBe("system");
    expect(providerBody.messages[0].content).toContain("核心内容是服务器读取的正文。");
    expect(JSON.stringify(providerBody.messages)).not.toContain(forged);
    expect(events[0]).toMatchObject({ type: "history", history: { isGenerating: true, hasMore: false } });
    expect(events[1]).toMatchObject({ type: "delta", text: "文档说明了真实流程。" });
    expect(events[2]).toMatchObject({ type: "done", history: { isGenerating: false, hasMore: false } });

    const initialHistory = events[0]?.type === "history" ? events[0].history : null;
    const delta = events[1]?.type === "delta" ? events[1] : null;
    const done = events[2]?.type === "done" ? events[2].history : null;
    const assistantId = initialHistory?.messages[0]?.id;
    expect(assistantId).toBeTruthy();
    expect(delta?.messageId).toBe(assistantId);
    expect(done?.messages).toContainEqual(expect.objectContaining({
      id: assistantId,
      role: "assistant",
      status: "complete",
      content: "文档说明了真实流程。"
    }));

    const callsBeforeRestore = fetchMock.mock.calls.length;
    resetDbClientForTests();
    const restored = await readDocumentChatHistory("guide.md");
    expect(restored.conversationId).toBe(initialHistory?.conversationId);
    expect(restored.messages).toContainEqual(expect.objectContaining({
      id: assistantId,
      status: "complete",
      content: "文档说明了真实流程。"
    }));
    expect(restored.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeRestore);
  });

  it("只在数据库持久化增量后发送 delta，并保持单次消息 ID 与最终正文一致", async () => {
    const fetchMock = vi.mocked(fetch);
    const allowFinish = deferred<void>();
    const upstreamReady = deferred<void>();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        controller.enqueue(encoder.encode(providerEvent({ choices: [{ delta: { content: "持久化后再发送" }, finish_reason: null }] })));
        await allowFinish.promise;
        controller.enqueue(encoder.encode(providerEvent({ choices: [{ delta: {}, finish_reason: "stop" }] })));
        controller.close();
      },
      start() {
        upstreamReady.resolve();
      }
    }), { status: 200, headers: { "content-type": "text/event-stream" } }));

    const output = await openDocumentChat(summaryRequest(), new AbortController().signal);
    const reader = output.getReader();
    const historyEvent = await readEvent(reader);
    expect(historyEvent.type).toBe("history");
    await withTimeout(upstreamReady.promise);
    const deltaEvent = await readEvent(reader);
    expect(deltaEvent).toMatchObject({ type: "delta", text: "持久化后再发送" });

    if (historyEvent.type !== "history" || deltaEvent.type !== "delta") throw new Error("事件顺序错误");
    const persistedWhileStreaming = await readDocumentChatHistory("guide.md");
    expect(deltaEvent.messageId).toBe(historyEvent.history.messages[0]?.id);
    expect(persistedWhileStreaming.messages[0]).toMatchObject({
      id: deltaEvent.messageId,
      content: deltaEvent.text,
      status: "streaming"
    });

    allowFinish.resolve();
    const doneEvent = await readEvent(reader);
    expect(doneEvent).toMatchObject({ type: "done" });
    expect(fetchMock).toHaveBeenCalledOnce();
    if (doneEvent.type !== "done") throw new Error("预期完成事件");
    expect(doneEvent.history.messages[0]).toMatchObject({
      id: deltaEvent.messageId,
      content: "持久化后再发送",
      status: "complete"
    });
    await reader.cancel();
  });

  it("已有概述后拒绝第二次 summary，且不会发起第二次 provider 请求", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("已有概述")));

    await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal));
    await expect(openDocumentChat(summaryRequest(), new AbortController().signal))
      .rejects.toMatchObject({ status: 409 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((await readDocumentChatHistory("guide.md")).messages[0]).toMatchObject({ status: "complete", content: "已有概述" });
  });

  it("发送问题时使用 SQLite 中的既有概述与当前问题，忽略客户端伪造的历史", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("已保存的概述")));
    await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal));
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("关于路径安全的回答")));

    const forged = "CLIENT_FORGED_HISTORY_5a21";
    const input = {
      path: "guide.md",
      action: "send",
      content: "路径校验在哪一步执行？",
      messages: [{ role: "assistant", content: forged }],
      history: [{ role: "assistant", content: forged }]
    } as unknown as DocumentChatRequest;
    const events = parseEvents(await readTextWithTimeout(await openDocumentChat(input, new AbortController().signal)));
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const storedHistory = await readDocumentChatHistory("guide.md");

    expect(body.messages.some((message) => message.content.includes("已保存的概述"))).toBe(true);
    expect(body.messages[0]?.content).toContain("核心内容是服务器读取的正文。");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "路径校验在哪一步执行？" });
    expect(JSON.stringify(body.messages)).not.toContain(forged);
    expect(events[0]?.type).toBe("history");
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(storedHistory.messages.map(({ role }) => role)).toEqual(["assistant", "user", "assistant"]);
    expect(storedHistory.messages[1]).toMatchObject({ content: "路径校验在哪一步执行？", status: "complete" });
  });

  it("失败后 retry 复用原助手消息 ID 和原问题，不重复插入 user 消息", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse([
      providerEvent({ choices: [{ delta: { content: "上次生成的部分内容" }, finish_reason: null }] }),
      providerEvent({ error: { message: "RAW_UPSTREAM_SECRET" } })
    ]));

    const failedEvents = parseEvents(await readTextWithTimeout(await openDocumentChat({
      path: "guide.md",
      action: "send",
      content: "如何确认文档版本？"
    }, new AbortController().signal)));
    const failedHistory = await readDocumentChatHistory("guide.md");
    const failedAssistant = failedHistory.messages.at(-1);
    expect(failedEvents.at(-1)?.type).toBe("error");
    expect(failedHistory.messages).toHaveLength(2);
    expect(failedAssistant).toMatchObject({ role: "assistant", status: "error", content: "上次生成的部分内容" });
    if (!failedAssistant) throw new Error("缺少失败的助手消息");

    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("版本由文档正文的哈希确定。")));
    const events = parseEvents(await readTextWithTimeout(await openDocumentChat({
      path: "guide.md",
      action: "retry",
      messageId: failedAssistant.id
    }, new AbortController().signal)));
    const retriedHistory = await readDocumentChatHistory("guide.md");
    const retryDelta = events.find((event) => event.type === "delta");

    expect(retryDelta).toMatchObject({ type: "delta", text: "版本由文档正文的哈希确定。" });
    expect(retryDelta?.type === "delta" && retryDelta.messageId).not.toBe(failedAssistant.id);
    expect(retriedHistory.messages).toHaveLength(3);
    expect(retriedHistory.messages[0]).toMatchObject({ role: "user", content: "如何确认文档版本？" });
    expect(retriedHistory.messages[1]).toMatchObject({
      id: failedAssistant.id,
      role: "assistant",
      status: "error",
      content: "上次生成的部分内容"
    });
    expect(retriedHistory.messages[2]).toMatchObject({
      role: "assistant",
      status: "complete",
      content: "版本由文档正文的哈希确定。"
    });
    if (retryDelta?.type !== "delta") throw new Error("缺少 retry delta");
    expect(retriedHistory.messages[2]?.id).toBe(retryDelta.messageId);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(retryBody.messages[0]?.content).toContain("核心内容是服务器读取的正文。");
    expect(retryBody.messages.at(-1)).toEqual({ role: "user", content: "如何确认文档版本？" });
  });

  it("读取跨 root 或丢失的历史游标时返回安全 409", async () => {
    const fetchMock = vi.mocked(fetch);
    await fs.writeFile(path.join(docsRoot, "other.md"), "另一份文档。", "utf8");
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("指南概述")));
    await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal));
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("另一份概述")));
    await readTextWithTimeout(await openDocumentChat(summaryRequest("other.md"), new AbortController().signal));
    const otherMessageId = (await readDocumentChatHistory("other.md")).messages[0]?.id;

    await expect(readDocumentChatHistory("guide.md", otherMessageId)).rejects.toMatchObject({ status: 409 });
    await expect(readDocumentChatHistory("guide.md", "missing-cursor")).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("文档修订后返回历史并标记 documentChanged，不发起 provider 请求", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("旧版本概述")));
    await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal));
    const before = await readDocumentChatHistory("guide.md");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fs.writeFile(path.join(docsRoot, "guide.md"), "# 新版本文档\n正文已经更新，内容与旧版本不同。\n", "utf8");

    const changed = await readDocumentChatHistory("guide.md");

    expect(changed.conversationId).toBe(before.conversationId);
    expect(changed.documentChanged).toBe(true);
    expect(changed.messages).toEqual(before.messages);
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("按新版本回答")));
    await readTextWithTimeout(await openDocumentChat({ path: "guide.md", action: "send", content: "请依据新版说明" }, new AbortController().signal));
    const latestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(latestBody.messages[0]?.content).toContain("正文已经更新，内容与旧版本不同。");
    expect(latestBody.messages[0]?.content).not.toContain("核心内容是服务器读取的正文。");
  });

  it("拒绝路径穿越、忽略目录、根目录外符号链接及指向忽略目录的链接", async () => {
    const fetchMock = vi.mocked(fetch);
    await fs.mkdir(path.join(docsRoot, ".git"), { recursive: true });
    await fs.writeFile(path.join(docsRoot, ".git", "ignored.md"), "内部忽略文件", "utf8");
    const outsideRoot = path.join(tempRoot, "private");
    await fs.mkdir(outsideRoot, { recursive: true });
    const outsideFile = path.join(outsideRoot, "private.md");
    await fs.writeFile(outsideFile, "根目录外的私有内容", "utf8");
    await fs.symlink(outsideFile, path.join(docsRoot, "escape.md"));
    await fs.symlink(path.join(docsRoot, ".git", "ignored.md"), path.join(docsRoot, "ignored-alias.md"));

    await expect(openDocumentChat(summaryRequest("../package.json"), new AbortController().signal)).rejects.toMatchObject({ status: 400 });
    await expect(openDocumentChat(summaryRequest(".git/ignored.md"), new AbortController().signal)).rejects.toMatchObject({ status: 400 });
    await expect(openDocumentChat(summaryRequest("escape.md"), new AbortController().signal)).rejects.toMatchObject({ status: 400 });
    await expect(openDocumentChat(summaryRequest("ignored-alias.md"), new AbortController().signal)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("文档根下真实名为 docs 的目录不会被 path alias 错误剥离", async () => {
    const fetchMock = vi.mocked(fetch);
    await fs.mkdir(path.join(docsRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(docsRoot, "docs", "guide.md"), "NESTED_DOCS_DIRECTORY_CONTENT", "utf8");
    fetchMock.mockResolvedValueOnce(upstreamResponse(completedAnswer("嵌套目录概述")));

    await readTextWithTimeout(await openDocumentChat(summaryRequest("docs/docs/guide.md"), new AbortController().signal));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]?.content).toContain("NESTED_DOCS_DIRECTORY_CONTENT");
    expect(await readDocumentChatHistory("docs/docs/guide.md")).toMatchObject({
      messages: [expect.objectContaining({ content: "嵌套目录概述", status: "complete" })]
    });
  });

  it("超过 512 KiB 的源文件在调用上游前被拒绝", async () => {
    const fetchMock = vi.mocked(fetch);
    await fs.writeFile(path.join(docsRoot, "guide.md"), "x".repeat(MAX_CHAT_DOCUMENT_BYTES + 1), "utf8");

    await expect(openDocumentChat(summaryRequest(), new AbortController().signal)).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("上游鉴权/连接错误脱敏，并把对应助手消息持久化为 error", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(`RAW_UPSTREAM_SECRET ${TEST_API_KEY}`, { status: 401 }));
    const authError = await openDocumentChat(summaryRequest(), new AbortController().signal).catch((value: unknown) => value);

    expect(authError).toBeInstanceOf(ChatServiceError);
    expect(authError).toMatchObject({ status: 502, message: "DeepSeek API 密钥无效或当前服务无权访问，请联系管理员检查配置。" });
    expect(String(authError)).not.toContain(TEST_API_KEY);
    expect(String(authError)).not.toContain("RAW_UPSTREAM_SECRET");
    expect((await readDocumentChatHistory("guide.md")).messages[0]).toMatchObject({ status: "error", content: "" });

    await fs.writeFile(path.join(docsRoot, "connection.md"), "另一份文档", "utf8");
    fetchMock.mockRejectedValueOnce(new Error(`internal endpoint contains ${TEST_API_KEY}`));
    await expect(openDocumentChat(summaryRequest("connection.md"), new AbortController().signal))
      .rejects.toMatchObject({ status: 502, message: "无法连接 DeepSeek 服务，请稍后重试。" });
    expect((await readDocumentChatHistory("connection.md")).messages[0]).toMatchObject({ status: "error", content: "" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("上游 SSE 错误只发送固定 error，并持久化错误状态与安全历史", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse([
      providerEvent({ error: { message: `authorization=${TEST_API_KEY}; RAW_UPSTREAM_SECRET_31b7` } })
    ]));

    const wire = await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal));
    const events = parseEvents(wire);
    const terminal = events.at(-1);

    expect(events[0]?.type).toBe("history");
    expect(terminal).toMatchObject({ type: "error", message: "DeepSeek 暂时无法生成回复，请稍后重试。" });
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(wire).not.toContain(TEST_API_KEY);
    expect(wire).not.toContain("RAW_UPSTREAM_SECRET_31b7");
    expect((await readDocumentChatHistory("guide.md")).messages[0]).toMatchObject({ status: "error", content: "" });
  });

  it("缺少服务端 API key 时返回配置错误且不发出请求", async () => {
    const fetchMock = vi.mocked(fetch);
    vi.stubEnv("DOCLENS_DEEPSEEK_API_KEY", "");

    await expect(openDocumentChat(summaryRequest(), new AbortController().signal))
      .rejects.toMatchObject({ status: 503, message: "DeepSeek API 尚未配置，请联系管理员完成服务端设置。" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("role-only 首块和注释帧不会卡住，后续 delta/done 均保留正确消息 ID", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse([
      providerEvent({ choices: [{ delta: { role: "assistant" }, finish_reason: null }] }),
      ": keepalive\n\n",
      providerEvent({ choices: [{ delta: { content: "逐块输出" }, finish_reason: null }] }),
      providerEvent({ choices: [{ delta: {}, finish_reason: "stop" }] })
    ]));

    const events = parseEvents(await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal)));
    const history = events[0]?.type === "history" ? events[0].history : null;
    const delta = events.find((event) => event.type === "delta");
    const done = events.at(-1);

    expect(delta).toMatchObject({ type: "delta", messageId: history?.messages[0]?.id, text: "逐块输出" });
    expect(done).toMatchObject({ type: "done", history: { isGenerating: false } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("SSE 行与多字节 UTF-8 字符跨 chunk 分段时仍完整解析", async () => {
    const fetchMock = vi.mocked(fetch);
    const raw = `: keepalive\r\n\r\n${providerEvent({ choices: [{ delta: { content: "中文回答" }, finish_reason: null }] })}${providerEvent({ choices: [{ delta: {}, finish_reason: "stop" }] })}`;
    const bytes = encoder.encode(raw);
    const firstChineseByte = bytes.indexOf(0xe4);
    expect(firstChineseByte).toBeGreaterThan(0);
    fetchMock.mockResolvedValueOnce(upstreamResponse([
      bytes.slice(0, firstChineseByte + 1),
      bytes.slice(firstChineseByte + 1, firstChineseByte + 2),
      bytes.slice(firstChineseByte + 2, firstChineseByte + 4),
      bytes.slice(firstChineseByte + 4)
    ]));

    const events = parseEvents(await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal)));
    expect(events.some((event) => event.type === "delta" && event.text === "中文回答")).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("EOF 或超出 32000 字符时保留已写入部分，发送 error 且不发送 done", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(upstreamResponse([
      providerEvent({ choices: [{ delta: { content: "尚未完成" }, finish_reason: null }] })
    ]));
    const incomplete = parseEvents(await readTextWithTimeout(await openDocumentChat(summaryRequest(), new AbortController().signal)));
    const afterEof = await readDocumentChatHistory("guide.md");

    await fs.writeFile(path.join(docsRoot, "long.md"), "另一个文档", "utf8");
    fetchMock.mockResolvedValueOnce(upstreamResponse([
      providerEvent({ choices: [{ delta: { content: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1) }, finish_reason: null }] })
    ]));
    const tooLong = parseEvents(await readTextWithTimeout(await openDocumentChat(summaryRequest("long.md"), new AbortController().signal)));
    const longHistory = await readDocumentChatHistory("long.md");

    expect(incomplete.at(-1)?.type).toBe("error");
    expect(incomplete.some((event) => event.type === "done")).toBe(false);
    expect(afterEof.messages[0]).toMatchObject({ status: "error", content: "尚未完成" });
    expect(tooLong.at(-1)).toMatchObject({
      type: "error",
      message: "回复超过单条消息的 32000 字符上限，请缩小问题后重试。"
    });
    expect(tooLong.some((event) => event.type === "done")).toBe(false);
    expect(longHistory.messages[0]).toMatchObject({ status: "error", content: "" });
  });

  it("请求达到超时时发送 error 并将生成状态持久化为 error", async () => {
    const fetchMock = vi.mocked(fetch);
    vi.stubEnv("DOCLENS_DEEPSEEK_TIMEOUT_MS", "50");
    vi.useFakeTimers();
    let upstreamSignal: AbortSignal | undefined;
    const streamStarted = deferred<void>();
    fetchMock.mockImplementationOnce((_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          upstreamSignal?.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true });
          streamStarted.resolve();
        }
      }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    });

    const output = await openDocumentChat(summaryRequest(), new AbortController().signal);
    const wirePromise = readTextWithTimeout(output, 5_000);
    await streamStarted.promise;
    await vi.advanceTimersByTimeAsync(50);
    const wire = await wirePromise;
    const events = parseEvents(wire);
    const history = await readDocumentChatHistory("guide.md");

    expect(upstreamSignal?.aborted).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "error", message: "DeepSeek 响应超时，请稍后重试。" });
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(history.messages[0]).toMatchObject({ status: "error", content: "" });
  });

  it("下游取消时 abort 上游、保留已持久化的 partial，并将消息置为 stopped", async () => {
    const fetchMock = vi.mocked(fetch);
    let upstreamSignal: AbortSignal | undefined;
    let upstreamCanceled = false;
    const upstreamReadStarted = deferred<void>();
    fetchMock.mockImplementationOnce((_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          upstreamReadStarted.resolve();
          controller.enqueue(encoder.encode(providerEvent({ choices: [{ delta: { content: "已保存的部分回答" }, finish_reason: null }] })));
          return new Promise<void>(() => undefined);
        },
        cancel() {
          upstreamCanceled = true;
        }
      }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    });

    const output = await openDocumentChat(summaryRequest(), new AbortController().signal);
    const reader = output.getReader();
    const initial = await readEvent(reader);
    expect(initial.type).toBe("history");
    await withTimeout(upstreamReadStarted.promise);
    const delta = await readEvent(reader);
    expect(delta).toMatchObject({ type: "delta", text: "已保存的部分回答" });
    await reader.cancel();

    const history = await readDocumentChatHistory("guide.md");
    expect(upstreamSignal?.aborted).toBe(true);
    expect(upstreamCanceled).toBe(true);
    expect(history.messages[0]).toMatchObject({ status: "stopped", content: "已保存的部分回答" });
    expect(history.isGenerating).toBe(false);
  });

  it("旧 generation 被 fencing 后不覆盖新 generation 的内容或完成状态", async () => {
    const fetchMock = vi.mocked(fetch);
    const allowChunk = deferred<void>();
    const upstreamReadStarted = deferred<void>();
    let emitted = false;
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (emitted) return;
        emitted = true;
        upstreamReadStarted.resolve();
        await allowChunk.promise;
        controller.enqueue(encoder.encode(providerEvent({ choices: [{ delta: { content: "旧 generation 内容" }, finish_reason: null }] })));
      }
    }), { status: 200, headers: { "content-type": "text/event-stream" } }));

    const output = await openDocumentChat(summaryRequest(), new AbortController().signal);
    const reader = output.getReader();
    const initial = await readEvent(reader);
    if (initial.type !== "history") throw new Error("预期初始 history");
    await withTimeout(upstreamReadStarted.promise);
    const assistantId = initial.history.messages[0]?.id;
    const replacementGenerationId = "replacement-generation-for-test";
    if (!initial.history.conversationId || !assistantId) throw new Error("缺少会话或助手消息 ID");

    getDb().run(sql`
      UPDATE chat_conversations SET active_generation_id = ${replacementGenerationId}
      WHERE id = ${initial.history.conversationId}
    `);
    getDb().run(sql`
      UPDATE chat_messages
      SET generation_id = ${replacementGenerationId}, content = '新 generation 已写入', status = 'streaming'
      WHERE id = ${assistantId}
    `);
    allowChunk.resolve();

    const terminal = await readEvent(reader);
    const current = await readDocumentChatHistory("guide.md");
    expect(terminal).toMatchObject({ type: "error", message: "当前会话已结束或被其他请求接管，回复已停止。" });
    expect(current.isGenerating).toBe(true);
    expect(current.messages[0]).toMatchObject({
      id: assistantId,
      content: "新 generation 已写入",
      status: "streaming"
    });
    expect(JSON.stringify(current)).not.toContain("旧 generation 内容");
    await reader.cancel();
  });

  it("外部 AbortSignal 取消时以 stopped 收尾并保留已产生内容", async () => {
    const fetchMock = vi.mocked(fetch);
    let upstreamSignal: AbortSignal | undefined;
    const upstreamReadStarted = deferred<void>();
    fetchMock.mockImplementationOnce((_input, init) => {
      upstreamSignal = init?.signal as AbortSignal;
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          upstreamReadStarted.resolve();
          controller.enqueue(encoder.encode(providerEvent({ choices: [{ delta: { content: "部分回答" }, finish_reason: null }] })));
          return new Promise<void>(() => undefined);
        }
      }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    });

    const requestController = new AbortController();
    const output = await openDocumentChat(summaryRequest(), requestController.signal);
    const reader = output.getReader();
    await readEvent(reader);
    await withTimeout(upstreamReadStarted.promise);
    await readEvent(reader);
    requestController.abort();

    const terminal = await reader.read();
    expect(terminal.done).toBe(true);
    expect(upstreamSignal?.aborted).toBe(true);
    expect(await readDocumentChatHistory("guide.md")).toMatchObject({
      isGenerating: false,
      messages: [expect.objectContaining({ status: "stopped", content: "部分回答" })]
    });
    await reader.cancel();
  });
});
