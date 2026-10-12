import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHistoryPayload, ChatMessage, ChatRequest } from "../domain/types";
import {
  ChatClientError,
  createStandaloneChat,
  loadDocumentChatHistory,
  loadStandaloneChatHistory,
  streamDocumentChat
} from "../services/chatClient";
import { useDocumentChat, type UseDocumentChatResult } from "./useDocumentChat";

const mocks = vi.hoisted(() => ({
  createStandaloneChat: vi.fn(),
  loadDocumentChatHistory: vi.fn(),
  loadStandaloneChatHistory: vi.fn(),
  streamDocumentChat: vi.fn()
}));

vi.mock("../services/chatClient", () => ({
  ChatClientError: class ChatClientErrorMock extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "ChatClientError";
      this.status = status;
    }
  },
  createStandaloneChat: mocks.createStandaloneChat,
  loadDocumentChatHistory: mocks.loadDocumentChatHistory,
  loadStandaloneChatHistory: mocks.loadStandaloneChatHistory,
  streamDocumentChat: mocks.streamDocumentChat
}));

type LoadOptions = {
  signal: AbortSignal;
  beforeMessageId?: string;
};

type StreamOptions = {
  signal: AbortSignal;
  onDelta: (text: string, messageId: string) => void;
  onHistory: (history: ChatHistoryPayload) => void;
};

type PendingHistory = {
  path: string;
  options: LoadOptions;
  resolve: (history: ChatHistoryPayload) => void;
  reject: (error: Error) => void;
};

type PendingStandaloneHistory = {
  conversationId: string;
  options: LoadOptions;
  resolve: (history: ChatHistoryPayload) => void;
  reject: (error: Error) => void;
};

type PendingStream = {
  request: ChatRequest;
  options: StreamOptions;
  resolve: () => void;
  reject: (error: Error) => void;
};

let dom: JSDOM;
let root: Root;
let container: HTMLElement;
let current: UseDocumentChatResult;
let pendingHistories: PendingHistory[];
let pendingStandaloneHistories: PendingStandaloneHistory[];
let pendingStreams: PendingStream[];
const loadMock = vi.mocked(loadDocumentChatHistory);
const standaloneLoadMock = vi.mocked(loadStandaloneChatHistory);
const streamMock = vi.mocked(streamDocumentChat);

function Harness({ open, path, conversationId }: { open: boolean; path: string; conversationId?: string }) {
  current = useDocumentChat({ open, path, conversationId });
  return null;
}

function render(open = true, path = "guide.md", strict = false, conversationId?: string): void {
  act(() => {
    const app = createElement(Harness, { open, path, conversationId });
    root.render(strict ? createElement(StrictMode, null, app) : app);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function chatHistory(
  messages: ChatMessage[] = [],
  overrides: Partial<ChatHistoryPayload> = {}
): ChatHistoryPayload {
  return {
    conversationId: "conversation-1",
    messages,
    isGenerating: false,
    documentChanged: false,
    hasMore: false,
    ...overrides
  };
}

function assistant(
  id: string,
  content: string,
  status: ChatMessage["status"] = "complete",
  error: string | null = null
): ChatMessage {
  return { id, role: "assistant", content, status, error };
}

function user(id: string, content: string): ChatMessage {
  return { id, role: "user", content, status: "complete", error: null };
}

async function resolveHistory(request: PendingHistory, history: ChatHistoryPayload): Promise<void> {
  await act(async () => {
    request.resolve(history);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function rejectHistory(request: PendingHistory, error: Error): Promise<void> {
  await act(async () => {
    request.reject(error);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function resolveStandaloneHistory(request: PendingStandaloneHistory, history: ChatHistoryPayload): Promise<void> {
  await act(async () => {
    request.resolve(history);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function startInitialRead(strict = false, path = "guide.md"): Promise<PendingHistory> {
  const expectedCalls = loadMock.mock.calls.length + 1;
  render(true, path, strict);
  await advance(50);
  expect(loadMock).toHaveBeenCalledTimes(expectedCalls);
  return pendingHistories.at(-1)!;
}

async function startSummary(strict = false, path = "guide.md"): Promise<PendingStream> {
  const read = await startInitialRead(strict, path);
  await resolveHistory(read, chatHistory());
  expect(streamMock).toHaveBeenCalledTimes(1);
  expect(pendingStreams[0].request).toEqual({ path, action: "summary" });
  return pendingStreams[0];
}

async function finishStream(
  request: PendingStream,
  assistantId: string,
  answer: string,
  finalHistory: ChatHistoryPayload
): Promise<void> {
  await act(async () => {
    request.options.onHistory(
      chatHistory(
        finalHistory.messages.map((message) =>
          message.id === assistantId
            ? { ...message, content: "", status: "streaming", error: null }
            : message
        ),
        { ...finalHistory, isGenerating: true }
      )
    );
    if (answer) {
      request.options.onDelta(answer, assistantId);
    }
    request.options.onHistory(finalHistory);
    request.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost"
  });
  container = dom.window.document.getElementById("root") as HTMLElement;
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: true,
    writable: true
  });
  root = createRoot(container);
  pendingHistories = [];
  pendingStandaloneHistories = [];
  pendingStreams = [];
  current = undefined as unknown as UseDocumentChatResult;

  loadMock.mockReset().mockImplementation((path: string, options: LoadOptions) =>
    new Promise<ChatHistoryPayload>((resolve, reject) => {
      pendingHistories.push({ path, options, resolve, reject });
    })
  );
  vi.mocked(createStandaloneChat).mockReset();
  standaloneLoadMock.mockReset().mockImplementation((conversationId: string, options: LoadOptions) =>
    new Promise<ChatHistoryPayload>((resolve, reject) => {
      pendingStandaloneHistories.push({ conversationId, options, resolve, reject });
    })
  );
  streamMock.mockReset().mockImplementation((request: ChatRequest, options: StreamOptions) =>
    new Promise<void>((resolve, reject) => {
      pendingStreams.push({ request, options, resolve, reject });
    })
  );
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  dom.window.close();
});

describe("useDocumentChat", () => {
  it("独立聊天按会话 ID 读取历史，空历史保持空白且发送使用该 ID", async () => {
    const conversationId = "standalone-conversation-1";
    render(true, "", false, conversationId);
    await advance(50);

    expect(standaloneLoadMock).toHaveBeenCalledTimes(1);
    expect(standaloneLoadMock).toHaveBeenCalledWith(conversationId, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(loadMock).not.toHaveBeenCalled();

    await resolveStandaloneHistory(pendingStandaloneHistories[0], chatHistory([], { conversationId }));
    expect(current.messages).toEqual([]);
    expect(current.isLoadingHistory).toBe(false);
    expect(streamMock).not.toHaveBeenCalled();

    let accepted = false;
    act(() => {
      accepted = current.send("第一条独立聊天消息");
    });
    expect(accepted).toBe(true);
    expect(pendingStreams[0].request).toEqual({
      conversationId,
      action: "send",
      content: "第一条独立聊天消息"
    });
  });

  it("独立聊天的更早分页与重试都使用同一会话 ID", async () => {
    const conversationId = "standalone-conversation-2";
    render(true, "", false, conversationId);
    await advance(50);
    await resolveStandaloneHistory(pendingStandaloneHistories[0], chatHistory([
      user("user-1", "之前的问题"),
      assistant("answer-1", "部分回复", "stopped")
    ], { conversationId, hasMore: true }));

    act(() => current.loadEarlier());
    expect(standaloneLoadMock).toHaveBeenCalledTimes(2);
    expect(standaloneLoadMock).toHaveBeenLastCalledWith(conversationId, expect.objectContaining({
      beforeMessageId: "user-1",
      signal: expect.any(AbortSignal)
    }));
    await resolveStandaloneHistory(pendingStandaloneHistories[1], chatHistory([
      assistant("older-answer", "更早的回复")
    ], { conversationId, hasMore: false }));

    act(() => current.retry());
    expect(pendingStreams[0].request).toEqual({
      conversationId,
      action: "retry",
      messageId: "answer-1"
    });
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("StrictMode 下先读取最新历史，空历史只自动请求一次概述且不伪造消息", async () => {
    render(true, "guide.md", true);
    expect(current.isLoadingHistory).toBe(true);
    let accepted = true;
    act(() => {
      accepted = current.send("概述尚未完成时的问题");
    });
    expect(accepted).toBe(false);

    await advance(50);
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(streamMock).not.toHaveBeenCalled();
    await resolveHistory(pendingHistories[0], chatHistory());

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(pendingStreams[0].request).toEqual({ path: "guide.md", action: "summary" });
    expect(current.messages).toEqual([]);

    const inProgress = chatHistory([assistant("summary-1", "", "streaming")], { isGenerating: true });
    act(() => pendingStreams[0].options.onHistory(inProgress));
    expect(current.messages).toEqual([assistant("summary-1", "", "streaming")]);
    expect(current.messages.some((message) => message.role === "user")).toBe(false);
  });

  it("已有持久化记录时直接展示，不自动请求概述", async () => {
    const read = await startInitialRead();
    const stored = chatHistory([assistant("summary-1", "已有概述")], { hasMore: true });
    await resolveHistory(read, stored);

    expect(current.messages).toEqual(stored.messages);
    expect(current.hasMore).toBe(true);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("初次 GET 失败时只重试读取，成功发现空历史后才生成概述", async () => {
    const read = await startInitialRead();
    await rejectHistory(read, new Error("offline"));
    expect(current.canRetry).toBe(true);
    expect(current.historyLoadFailed).toBe(true);
    expect(current.send("GET 失败时不能发送")).toBe(false);
    expect(streamMock).not.toHaveBeenCalled();

    act(() => current.retry());
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(streamMock).not.toHaveBeenCalled();
    await resolveHistory(pendingHistories[1], chatHistory());
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(pendingStreams[0].request).toEqual({ path: "guide.md", action: "summary" });
  });

  it("连续追问只发送 action/content，不发送客户端历史或重复 user", async () => {
    const summary = await startSummary();
    await finishStream(summary, "summary-1", "这份文档介绍启动流程。", chatHistory([
      assistant("summary-1", "这份文档介绍启动流程。")
    ]));

    let accepted = false;
    act(() => {
      accepted = current.send("请解释启动步骤");
    });
    expect(accepted).toBe(true);
    act(() => {
      expect(current.send("并发消息应被忽略")).toBe(false);
    });
    expect(pendingStreams[1].request).toEqual({
      path: "guide.md",
      action: "send",
      content: "请解释启动步骤"
    });

    const response = chatHistory([
      assistant("summary-1", "这份文档介绍启动流程。"),
      user("user-1", "请解释启动步骤"),
      assistant("answer-1", "", "streaming")
    ], { isGenerating: true });
    act(() => pendingStreams[1].options.onHistory(response));
    act(() => pendingStreams[1].options.onDelta("启动步骤如下。", "answer-1"));
    expect(current.messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "assistant", content: "这份文档介绍启动流程。" },
      { role: "user", content: "请解释启动步骤" },
      { role: "assistant", content: "启动步骤如下。" }
    ]);
  });

  it("停止保留服务端 partial，重试按 assistant id 操作且不重复 user", async () => {
    const summary = await startSummary();
    await finishStream(summary, "summary-1", "文档概述", chatHistory([
      assistant("summary-1", "文档概述")
    ]));

    act(() => current.send("继续说明"));
    const send = pendingStreams[1];
    const generating = chatHistory([
      assistant("summary-1", "文档概述"),
      user("user-1", "继续说明"),
      assistant("answer-1", "", "streaming")
    ], { isGenerating: true });
    act(() => send.options.onHistory(generating));
    act(() => send.options.onDelta("已经生成的部分", "answer-1"));
    act(() => current.stop());

    expect(send.options.signal.aborted).toBe(true);
    expect(current.isStreaming).toBe(false);
    expect(pendingHistories).toHaveLength(2);
    await resolveHistory(pendingHistories[1], chatHistory([
      assistant("summary-1", "文档概述"),
      user("user-1", "继续说明"),
      assistant("answer-1", "已经生成的部分", "stopped")
    ]));
    expect(current.messages[2]).toEqual(assistant("answer-1", "已经生成的部分", "stopped"));
    expect(current.canRetry).toBe(true);

    act(() => current.retry());
    expect(pendingStreams).toHaveLength(3);
    expect(pendingStreams[2].request).toEqual({
      path: "guide.md",
      action: "retry",
      messageId: "answer-1"
    });
    expect(current.messages.filter((message) => message.id === "user-1")).toHaveLength(1);
  });

  it("有有效的 stopped partial 时允许继续追问", async () => {
    const summary = await startSummary();
    await finishStream(summary, "summary-1", "文档概述", chatHistory([
      assistant("summary-1", "文档概述")
    ]));

    act(() => current.send("第一问"));
    const request = pendingStreams[1];
    act(() => request.options.onHistory(chatHistory([
      assistant("summary-1", "文档概述"),
      user("user-1", "第一问"),
      assistant("answer-1", "", "streaming")
    ], { isGenerating: true })));
    act(() => request.options.onDelta("部分答案", "answer-1"));
    act(() => current.stop());
    await resolveHistory(pendingHistories[1], chatHistory([
      assistant("summary-1", "文档概述"),
      user("user-1", "第一问"),
      assistant("answer-1", "部分答案", "stopped")
    ]));

    let accepted = false;
    act(() => {
      accepted = current.send("基于现有部分继续补充");
    });
    expect(accepted).toBe(true);
    expect(pendingStreams[2].request).toEqual({
      path: "guide.md",
      action: "send",
      content: "基于现有部分继续补充"
    });
  });

  it("远端生成期间只轮询 GET，不启动本地 provider 请求", async () => {
    const initial = await startInitialRead();
    await resolveHistory(initial, chatHistory([
      assistant("summary-1", "概述"),
      user("user-1", "问题"),
      assistant("answer-1", "正在生成", "streaming")
    ], { isGenerating: true }));
    expect(current.isGenerating).toBe(true);
    expect(streamMock).not.toHaveBeenCalled();
    expect(current.send("不要提交")).toBe(false);

    await advance(1_500);
    expect(loadMock).toHaveBeenCalledTimes(2);
    await resolveHistory(pendingHistories[1], chatHistory([
      assistant("summary-1", "概述"),
      user("user-1", "问题"),
      assistant("answer-1", "已完成", "complete")
    ]));
    expect(current.isGenerating).toBe(false);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("POST 返回 409 时重新 GET 对账并等待远端，不重发 provider 请求", async () => {
    const initial = await startInitialRead();
    await resolveHistory(initial, chatHistory([assistant("summary-1", "概述")]));
    act(() => current.send("问题"));
    expect(pendingStreams).toHaveLength(1);

    await act(async () => {
      pendingStreams[0].reject(new ChatClientError("已有任务正在运行", 409));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadMock).toHaveBeenCalledTimes(2);
    await resolveHistory(pendingHistories[1], chatHistory([
      assistant("summary-1", "概述"),
      user("user-1", "问题"),
      assistant("answer-1", "远端正在生成", "streaming")
    ], { isGenerating: true }));
    expect(current.isGenerating).toBe(true);
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it("关闭或切换路径会 abort 请求并隔离晚到 GET 与 delta", async () => {
    const initial = await startInitialRead();
    render(false, "guide.md");
    expect(initial.options.signal.aborted).toBe(true);
    await resolveHistory(initial, chatHistory([assistant("old", "旧文档迟到历史") ]));
    expect(current.messages).toEqual([]);

    const next = await startSummary(false, "next.md");
    render(true, "changed.md");
    expect(next.options.signal.aborted).toBe(true);
    act(() => next.options.onDelta("旧路径迟到增量", "old-answer"));
    await act(async () => {
      next.reject(new Error("旧路径迟到错误"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(current.messages).toEqual([]);
    expect(current.error).toBeNull();
    expect(loadMock).toHaveBeenCalledTimes(2);

    await advance(50);
    expect(pendingHistories.at(-1)?.path).toBe("changed.md");
    await resolveHistory(pendingHistories.at(-1)!, chatHistory());
    expect(pendingStreams.at(-1)?.request).toEqual({ path: "changed.md", action: "summary" });
  });

  it("加载较早分页可恢复超过 40 条历史，合并 SSE 后仍保留旧页且不触发生成", async () => {
    const latestPage = Array.from({ length: 40 }, (_, index) =>
      index % 2 === 0
        ? user(`latest-${index}`, `问题 ${index}`)
        : assistant(`latest-${index}`, `回答 ${index}`)
    );
    const initial = await startInitialRead();
    await resolveHistory(initial, chatHistory(latestPage, { hasMore: true, documentChanged: true }));
    expect(current.messages).toHaveLength(40);
    expect(current.documentChanged).toBe(true);
    expect(current.hasMore).toBe(true);

    act(() => current.loadEarlier());
    expect(pendingHistories).toHaveLength(2);
    expect(pendingHistories[1].options.beforeMessageId).toBe("latest-0");
    expect(streamMock).not.toHaveBeenCalled();
    const olderPage = Array.from({ length: 8 }, (_, index) =>
      index % 2 === 0
        ? user(`older-${index}`, `早期问题 ${index}`)
        : assistant(`older-${index}`, `早期回答 ${index}`)
    );
    await resolveHistory(pendingHistories[1], chatHistory(olderPage, { hasMore: false, documentChanged: true }));
    expect(current.messages).toHaveLength(48);
    expect(current.messages[0]?.id).toBe("older-0");
    expect(current.messages[8]?.id).toBe("latest-0");
    expect(current.hasMore).toBe(false);
    expect(current.documentChanged).toBe(true);
    expect(streamMock).not.toHaveBeenCalled();

    let accepted = false;
    act(() => {
      accepted = current.send("继续提问");
    });
    expect(accepted).toBe(true);
    const send = pendingStreams[0];
    expect(send.request).toEqual({ path: "guide.md", action: "send", content: "继续提问" });
    const updatedLatest = chatHistory([
      ...latestPage,
      user("new-user", "继续提问"),
      assistant("new-answer", "", "streaming")
    ], { isGenerating: true, hasMore: true, documentChanged: true });
    act(() => send.options.onHistory(updatedLatest));
    expect(current.messages[0]?.id).toBe("older-0");
    expect(current.messages).toHaveLength(50);
    expect(current.messages.at(-2)?.id).toBe("new-user");
    expect(current.hasMore).toBe(false);
  });

  it("更早分页读取失败只显示分页错误，重新点击只 GET 不执行 provider", async () => {
    const initial = await startInitialRead();
    await resolveHistory(initial, chatHistory([assistant("summary-1", "概述")], { hasMore: true }));

    act(() => current.loadEarlier());
    const failedPage = pendingHistories[1];
    await rejectHistory(failedPage, new Error("offline"));
    expect(current.loadEarlierError).toContain("更早");
    expect(current.error).toBeNull();
    expect(current.canRetry).toBe(false);
    expect(streamMock).not.toHaveBeenCalled();

    act(() => current.loadEarlier());
    expect(loadMock).toHaveBeenCalledTimes(3);
    expect(pendingHistories[2].options.beforeMessageId).toBe("summary-1");
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("路径关闭会 abort 更早分页读取并丢弃其迟到数据", async () => {
    const initial = await startInitialRead();
    await resolveHistory(initial, chatHistory([assistant("latest-1", "概述")], { hasMore: true }));
    act(() => current.loadEarlier());
    const older = pendingHistories[1];

    render(false, "guide.md");
    expect(older.options.signal.aborted).toBe(true);
    await resolveHistory(older, chatHistory([user("old-user", "迟到旧记录")]));
    expect(current.messages).toEqual([]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("拒绝超过 4000 字的问题且不创建 provider 请求", async () => {
    const initial = await startInitialRead();
    await resolveHistory(initial, chatHistory([assistant("summary-1", "已有概述")]));
    let accepted = true;
    act(() => {
      accepted = current.send("x".repeat(4_001));
    });
    expect(accepted).toBe(false);
    expect(streamMock).not.toHaveBeenCalled();
    expect(current.error).toContain("4000");
  });
});
