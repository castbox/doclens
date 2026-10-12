import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatHistoryPayload, DocumentChatRequest } from "@/features/chat/domain/types";
import { ChatClientError, loadDocumentChatHistory, streamDocumentChat } from "./chatClient";

const request: DocumentChatRequest = {
  path: "guide.md",
  action: "send",
  content: "请解释这份文档"
};

const emptyHistory: ChatHistoryPayload = {
  conversationId: null,
  messages: [],
  isGenerating: false,
  documentChanged: false,
  hasMore: false
};

const completedHistory: ChatHistoryPayload = {
  conversationId: "conversation-1",
  messages: [
    { id: "user-1", role: "user", content: "请解释这份文档", status: "complete", error: null },
    { id: "assistant-1", role: "assistant", content: "这是一份指南。", status: "complete", error: null }
  ],
  isGenerating: false,
  documentChanged: false,
  hasMore: true
};

function responseFromChunks(chunks: Uint8Array[], headers?: HeadersInit): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", ...Object.fromEntries(new Headers(headers)) }
  });
}

function eventData(value: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(value)}\r\n\r\n`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDocumentChatHistory", () => {
  it("按编码路径以 no-store 读取并严格返回持久化历史", async () => {
    const history = completedHistory;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(history), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(
      loadDocumentChatHistory("guide path/章#1.md", { signal: controller.signal, beforeMessageId: "message-2" })
    ).resolves.toEqual(history);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/history?path=guide%20path%2F%E7%AB%A0%231.md&beforeMessageId=message-2",
      expect.objectContaining({ method: "GET", cache: "no-store", signal: controller.signal })
    );
  });

  it("拒绝非法角色、状态、ID 和过长消息", async () => {
    const invalidHistories = [
      [{ id: "message-1", role: "system", content: "不接受", status: "complete", error: null }],
      [{ id: "message-1", role: "user", content: "问题", status: "queued", error: null }],
      [{ id: "", role: "user", content: "问题", status: "complete", error: null }],
      [{ id: "message-1", role: "user", content: "x".repeat(32_001), status: "complete", error: null }],
      Array.from({ length: 41 }, (_, index) => ({
        id: `message-${index}`,
        role: "user",
        content: "x",
        status: "complete",
        error: null
      })),
      Array.from({ length: 5 }, (_, index) => ({
        id: `message-${index}`,
        role: "user",
        content: "x".repeat(25_001),
        status: "complete",
        error: null
      }))
    ];

    for (const messages of invalidHistories) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...emptyHistory, messages }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })));
      await expect(loadDocumentChatHistory("guide.md", { signal: new AbortController().signal })).rejects.toThrow("聊天历史");
    }
  });

  it("拒绝超过合理大小的 history body", async () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(30_000),
      status: "complete",
      error: null
    }));
    const oversizedJson = JSON.stringify({ ...emptyHistory, messages });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(oversizedJson, {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    await expect(loadDocumentChatHistory("guide.md", { signal: new AbortController().signal })).rejects.toThrow("响应过大");
  });
});

describe("streamDocumentChat", () => {
  it("流式解析 UTF-8、消息 ID 和 history 元数据，并在带历史的 done 后完成", async () => {
    const source = new TextEncoder().encode(
      `data: ${JSON.stringify({ type: "history", history: emptyHistory })}\r\n\r\ndata: ${JSON.stringify({ type: "delta", messageId: "assistant-1", text: "你好，🌏" })}\r\n\r\ndata: ${JSON.stringify({ type: "done", history: completedHistory })}\r\n\r\n`
    );
    const characterBytes = new TextEncoder().encode("好");
    const characterOffset = source.findIndex((byte, index) =>
      characterBytes.every((characterByte, characterIndex) => source[index + characterIndex] === characterByte)
    );
    const splitAt = characterOffset + 1;
    const response = responseFromChunks([source.slice(0, splitAt), source.slice(splitAt, splitAt + 1), source.slice(splitAt + 1)]);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const deltas: Array<{ text: string; messageId: string }> = [];
    const histories: ChatHistoryPayload[] = [];
    const controller = new AbortController();

    await expect(
      streamDocumentChat(request, {
        signal: controller.signal,
        onDelta: (text, messageId) => deltas.push({ text, messageId }),
        onHistory: (history) => histories.push(history)
      })
    ).resolves.toBeUndefined();

    expect(deltas).toEqual([{ text: "你好，🌏", messageId: "assistant-1" }]);
    expect(histories).toEqual([emptyHistory, completedHistory]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(request),
        signal: controller.signal
      })
    );
  });

  it("为 409 响应保留 ChatClientError 状态码", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "已有生成任务正在运行" }), {
      status: 409,
      headers: { "content-type": "application/json" }
    })));

    const operation = streamDocumentChat(request, {
      signal: new AbortController().signal,
      onDelta: vi.fn(),
      onHistory: vi.fn()
    });
    await expect(operation).rejects.toBeInstanceOf(ChatClientError);
    await expect(operation).rejects.toMatchObject({ name: "ChatClientError", status: 409, message: "已有生成任务正在运行" });
  });

  it("限制 JSON 错误长度，并为 HTML 和网络异常返回固定提示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy error details</html>", {
      status: 502,
      headers: { "content-type": "text/html" }
    })));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toMatchObject({ message: "聊天请求失败（HTTP 502）" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "x".repeat(1_001) }), {
      status: 502,
      headers: { "content-type": "application/json" }
    })));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toMatchObject({ message: "聊天请求失败（HTTP 502）" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "上游错误 sk-12345678901234567890" }), {
      status: 502,
      headers: { "content-type": "application/json" }
    })));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toMatchObject({ message: "聊天请求失败（HTTP 502）" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("raw network detail")));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toMatchObject({ message: "无法连接聊天服务，请稍后重试" });
  });

  it("拒绝没有带 history 的 done 事件或没有 done 的 EOF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromChunks([
      eventData({ type: "delta", messageId: "assistant-1", text: "部分回复" })
    ])));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toThrow("聊天响应意外结束");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromChunks([eventData({ type: "done" })])));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toThrow("无效事件");
  });

  it("错误事件先交付可选历史再抛出 bounded 错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromChunks([
      eventData({ type: "error", message: "上游连接失败", history: emptyHistory })
    ])));
    const histories: ChatHistoryPayload[] = [];

    await expect(
      streamDocumentChat(request, {
        signal: new AbortController().signal,
        onDelta: vi.fn(),
        onHistory: (history) => histories.push(history)
      })
    ).rejects.toThrow("上游连接失败");
    expect(histories).toEqual([emptyHistory]);
  });

  it("不接受旧版裸 [DONE] 结束标记", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFromChunks([
      new TextEncoder().encode("data: [DONE]\n\n")
    ])));

    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toThrow("无法识别的数据");
  });

  it("主动取消 reader，并保留 AbortError 名称", async () => {
    let cancelCalled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(eventData({ type: "delta", messageId: "assistant-1", text: "正在生成" }));
      },
      cancel() {
        cancelCalled = true;
      }
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    })));

    const controller = new AbortController();
    const operation = streamDocumentChat(request, {
      signal: controller.signal,
      onDelta: vi.fn(),
      onHistory: vi.fn()
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelCalled).toBe(true);
  });

  it("限制 send 输入长度且不发起请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const oversizedRequest: DocumentChatRequest = { ...request, content: "x".repeat(4_001) };

    await expect(
      streamDocumentChat(oversizedRequest, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toThrow("4000");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非 SSE 与不可读取的 response body 会返回错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not a stream", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toThrow("没有返回有效的流式响应");

    const lockedResponse = new Response(new ReadableStream<Uint8Array>(), {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
    lockedResponse.body?.getReader();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(lockedResponse));
    await expect(
      streamDocumentChat(request, { signal: new AbortController().signal, onDelta: vi.fn(), onHistory: vi.fn() })
    ).rejects.toThrow("响应流无法读取");
  });
});
