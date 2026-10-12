import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbClientForTests } from "@/db/client";
import type { ChatDocumentIdentity, DocumentChatRequest } from "@/features/chat/domain/types";
import {
  beginDocumentChatTurn,
  ChatHistoryError,
  appendDocumentChatDelta,
  finishDocumentChatTurn,
  getDocumentChatHistory
} from "./chatHistoryRepo";
import { clearConfigCache } from "@/shared/utils/env";

const originalDocsRoot = process.env.DOCLENS_DOCS_ROOT;
const originalDbPath = process.env.DOCLENS_DB_PATH;

describe("chatHistoryRepo", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doclens-chat-history-"));
    process.env.DOCLENS_DOCS_ROOT = path.join(tempDir, "docs");
    process.env.DOCLENS_DB_PATH = path.join(tempDir, "data", "doclens.sqlite");
    clearConfigCache();
    resetDbClientForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDbClientForTests();
    clearConfigCache();
    if (originalDocsRoot === undefined) {
      delete process.env.DOCLENS_DOCS_ROOT;
    } else {
      process.env.DOCLENS_DOCS_ROOT = originalDocsRoot;
    }
    if (originalDbPath === undefined) {
      delete process.env.DOCLENS_DB_PATH;
    } else {
      process.env.DOCLENS_DB_PATH = originalDbPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function document(rootName = "project-a", revision = "revision-1", relativePath = "guide.md"): ChatDocumentIdentity {
    return {
      docsRoot: path.join(tempDir, rootName),
      path: relativePath,
      repositoryPath: `docs/${relativePath}`,
      revision
    };
  }

  function summary(doc: ChatDocumentIdentity, leaseMs = 5_000) {
    const request: DocumentChatRequest = { path: doc.path, action: "summary" };
    return beginDocumentChatTurn(doc, request, leaseMs);
  }

  it("按 canonical root 和文档路径隔离，并在重开数据库后恢复同一会话", () => {
    const firstDocument = document();
    const firstGeneration = summary(firstDocument);
    expect(appendDocumentChatDelta(firstGeneration, "文档概述" )).toBe(true);
    finishDocumentChatTurn(firstGeneration, "complete");

    const sameDocument = { ...firstDocument, repositoryPath: "alternate/docs/guide.md" };
    const reopenedBeforeReset = getDocumentChatHistory(sameDocument);
    expect(reopenedBeforeReset.conversationId).toBe(firstGeneration.conversationId);
    expect(reopenedBeforeReset.messages.map((message) => message.content)).toEqual(["文档概述"]);

    resetDbClientForTests();
    const reopenedAfterReset = getDocumentChatHistory(sameDocument);
    expect(reopenedAfterReset.conversationId).toBe(firstGeneration.conversationId);
    expect(reopenedAfterReset.messages[0]).toMatchObject({ role: "assistant", status: "complete", content: "文档概述" });

    const otherRoot = document("project-b");
    const otherGeneration = summary(otherRoot);
    expect(otherGeneration.conversationId).not.toBe(firstGeneration.conversationId);
    expect(getDocumentChatHistory(otherRoot).messages).toHaveLength(1);
    expect(getDocumentChatHistory(firstDocument).messages).toHaveLength(1);
  });

  it("禁止对已有消息的文档重复创建概述", () => {
    const doc = document();
    const generation = summary(doc);
    appendDocumentChatDelta(generation, "概述");
    finishDocumentChatTurn(generation, "complete");

    try {
      summary(doc);
      throw new Error("expected summary conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ChatHistoryError);
      expect((error as ChatHistoryError).status).toBe(409);
    }
  });

  it("用事务 lease 阻止同一文档的第二个活动生成", () => {
    const doc = document();
    const active = summary(doc);

    try {
      beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "继续说明" }, 5_000);
      throw new Error("expected active generation conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(ChatHistoryError);
      expect((error as ChatHistoryError).status).toBe(409);
    }

    expect(getDocumentChatHistory(doc).isGenerating).toBe(true);
    finishDocumentChatTurn(active, "stopped");
  });

  it("读取过期 lease 时保留 partial 并标为停止，旧 generation 无法覆盖新 generation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T00:00:00.000Z"));
    const doc = document();
    const oldGeneration = summary(doc, 100);
    expect(appendDocumentChatDelta(oldGeneration, "已生成的部分内容")).toBe(true);

    vi.setSystemTime(new Date("2026-10-12T00:00:00.101Z"));
    const recovered = getDocumentChatHistory(doc);
    expect(recovered.isGenerating).toBe(false);
    expect(recovered.messages[0]).toMatchObject({ status: "stopped", content: "已生成的部分内容" });

    const nextGeneration = beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "继续" }, 1_000);
    expect(appendDocumentChatDelta(oldGeneration, "过期响应")).toBe(false);
    finishDocumentChatTurn(oldGeneration, "complete");
    expect(getDocumentChatHistory(doc).isGenerating).toBe(true);
    expect(appendDocumentChatDelta(nextGeneration, "新的回答")).toBe(true);
    finishDocumentChatTurn(nextGeneration, "complete");

    const finalHistory = getDocumentChatHistory(doc);
    expect(finalHistory.isGenerating).toBe(false);
    expect(finalHistory.messages.map((message) => message.content)).toContain("已生成的部分内容");
    expect(finalHistory.messages.map((message) => message.content)).not.toContain("过期响应");
  });

  it("停止后重试保留旧 partial 并为同一用户问题追加新的助手尝试", () => {
    const doc = document();
    const first = beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "解释这一段" }, 5_000);
    const userMessageId = first.history.messages[0]?.id;
    const assistantMessageId = first.assistantMessageId;

    expect(first.messages).toEqual([{ role: "user", content: "解释这一段" }]);
    expect(appendDocumentChatDelta(first, "部分回答")).toBe(true);
    finishDocumentChatTurn(first, "stopped");
    expect(getDocumentChatHistory(doc).messages[1]).toMatchObject({ status: "stopped", content: "部分回答" });

    const retry = beginDocumentChatTurn(
      doc,
      { path: doc.path, action: "retry", messageId: assistantMessageId },
      5_000
    );
    expect(retry.assistantMessageId).not.toBe(assistantMessageId);
    expect(retry.history.messages).toHaveLength(3);
    expect(retry.history.messages[0]?.id).toBe(userMessageId);
    expect(retry.history.messages[1]).toMatchObject({ id: assistantMessageId, status: "stopped", content: "部分回答" });
    expect(retry.history.messages[2]).toMatchObject({ id: retry.assistantMessageId, status: "pending", content: "" });
    expect(retry.messages).toEqual([{ role: "user", content: "解释这一段" }]);

    expect(appendDocumentChatDelta(retry, "完整回答")).toBe(true);
    finishDocumentChatTurn(retry, "complete");
    const finalHistory = getDocumentChatHistory(doc);
    expect(finalHistory.messages).toHaveLength(3);
    expect(finalHistory.messages[1]).toMatchObject({ id: assistantMessageId, status: "stopped", content: "部分回答" });
    expect(finalHistory.messages[2]).toMatchObject({ id: retry.assistantMessageId, status: "complete", content: "完整回答" });
    expect(finalHistory.messages.filter((message) => message.role === "user" && message.id === userMessageId)).toHaveLength(1);

    const followup = beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "继续追问" }, 5_000);
    expect(followup.messages).toEqual([
      { role: "user", content: "解释这一段" },
      { role: "assistant", content: "完整回答" },
      { role: "user", content: "继续追问" }
    ]);
    finishDocumentChatTurn(followup, "stopped");
  });

  it("摘要重试追加新 summary row，旧 partial 保留且后续上下文选最新有效摘要", () => {
    const doc = document();
    const first = summary(doc);
    expect(appendDocumentChatDelta(first, "旧摘要 partial")).toBe(true);
    finishDocumentChatTurn(first, "stopped");

    const retry = beginDocumentChatTurn(doc, { path: doc.path, action: "retry", messageId: first.assistantMessageId }, 5_000);
    expect(retry.assistantMessageId).not.toBe(first.assistantMessageId);
    expect(retry.messages).toEqual([]);
    expect(retry.history.messages).toHaveLength(2);
    expect(retry.history.messages[0]).toMatchObject({ id: first.assistantMessageId, status: "stopped", content: "旧摘要 partial" });
    expect(retry.history.messages[1]).toMatchObject({ id: retry.assistantMessageId, status: "pending", content: "" });

    appendDocumentChatDelta(retry, "新摘要");
    finishDocumentChatTurn(retry, "complete");
    const followup = beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "询问摘要" }, 5_000);
    expect(followup.messages).toEqual([
      { role: "assistant", content: "新摘要" },
      { role: "user", content: "询问摘要" }
    ]);
    finishDocumentChatTurn(followup, "stopped");
  });

  it("只把交替且非空的服务端历史发送给模型，并在完整回答后更新 revision", () => {
    const firstRevision = document("project-a", "revision-1");
    const overview = summary(firstRevision);
    appendDocumentChatDelta(overview, "简要概述");
    finishDocumentChatTurn(overview, "complete");

    const firstQuestion = beginDocumentChatTurn(
      firstRevision,
      { path: firstRevision.path, action: "send", content: "问题一" },
      5_000
    );
    expect(firstQuestion.messages.map((message) => message.role)).toEqual(["assistant", "user"]);
    appendDocumentChatDelta(firstQuestion, "回答一");
    finishDocumentChatTurn(firstQuestion, "complete");

    const changedRevision = { ...firstRevision, revision: "revision-2" };
    expect(getDocumentChatHistory(changedRevision).documentChanged).toBe(true);
    const secondQuestion = beginDocumentChatTurn(
      changedRevision,
      { path: changedRevision.path, action: "send", content: "问题二" },
      5_000
    );
    expect(secondQuestion.history.documentChanged).toBe(true);
    expect(secondQuestion.messages).toEqual([
      { role: "assistant", content: "简要概述" },
      { role: "user", content: "问题一" },
      { role: "assistant", content: "回答一" },
      { role: "user", content: "问题二" }
    ]);
    expect(secondQuestion.messages.every((message, index, messages) => index === 0 || messages[index - 1]?.role !== message.role)).toBe(true);

    appendDocumentChatDelta(secondQuestion, "回答二");
    finishDocumentChatTurn(secondQuestion, "complete");
    expect(getDocumentChatHistory(changedRevision).documentChanged).toBe(false);
  });

  it("保存超过模型上下文上限的完整历史，并可用游标逐页读取", () => {
    const doc = document();
    const overview = summary(doc);
    appendDocumentChatDelta(overview, "文档概述");
    finishDocumentChatTurn(overview, "complete");

    let contextWasLimited = false;
    for (let index = 1; index <= 22; index += 1) {
      const generation = beginDocumentChatTurn(
        doc,
        { path: doc.path, action: "send", content: `问题 ${index}` },
        5_000
      );
      const roles = generation.messages.map((message) => message.role);
      expect(roles[roles.length - 1]).toBe("user");
      expect(roles.every((role, roleIndex) => roleIndex === 0 || roles[roleIndex - 1] !== role)).toBe(true);
      contextWasLimited ||= generation.contextLimited === true;
      appendDocumentChatDelta(generation, `回答 ${index}`);
      finishDocumentChatTurn(generation, "complete");
    }

    expect(contextWasLimited).toBe(true);
    const pages = [getDocumentChatHistory(doc)];
    expect(pages[0]?.messages.length).toBeLessThanOrEqual(40);
    expect(pages[0]?.hasMore).toBe(true);
    while (pages[pages.length - 1]?.hasMore) {
      const currentPage = pages[pages.length - 1];
      const cursor = currentPage?.messages[0]?.id;
      expect(cursor).toBeTruthy();
      pages.push(getDocumentChatHistory(doc, cursor));
    }

    const messagesInChronologicalOrder = pages.reverse().flatMap((page) => page.messages);
    expect(messagesInChronologicalOrder).toHaveLength(45);
    expect(new Set(messagesInChronologicalOrder.map((message) => message.id)).size).toBe(45);
    expect(messagesInChronologicalOrder[0]).toMatchObject({ role: "assistant", content: "文档概述" });
    expect(messagesInChronologicalOrder.at(-2)).toMatchObject({ role: "user", content: "问题 22" });
    expect(messagesInChronologicalOrder.at(-1)).toMatchObject({ role: "assistant", content: "回答 22" });
  });

  it("保留失败的空回答行，但后续模型上下文跳过该空问题对", () => {
    const doc = document();
    const failed = beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "失败问题" }, 5_000);
    finishDocumentChatTurn(failed, "error", "模拟失败");

    const next = beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "后续问题" }, 5_000);
    expect(next.messages).toEqual([{ role: "user", content: "后续问题" }]);
    expect(next.history.messages).toHaveLength(4);
    expect(next.history.messages[0]).toMatchObject({ role: "user", content: "失败问题", status: "complete" });
    expect(next.history.messages[1]).toMatchObject({ role: "assistant", content: "", status: "error" });
    expect(next.contextLimited).toBe(false);
    finishDocumentChatTurn(next, "stopped");
    expect(getDocumentChatHistory(doc).messages).toHaveLength(4);
  });

  it("对不存在或属于其他文档的分页游标统一返回 409", () => {
    const docA = document("project-a");
    const docB = document("project-b");
    const historyA = summary(docA);
    const historyB = summary(docB);
    const foreignCursor = historyB.history.messages[0]?.id;
    finishDocumentChatTurn(historyA, "stopped");
    finishDocumentChatTurn(historyB, "stopped");

    for (const cursor of [foreignCursor ?? "missing-message-id", "missing-message-id"]) {
      try {
        getDocumentChatHistory(docA, cursor);
        throw new Error("expected cursor conflict");
      } catch (error) {
        expect(error).toBeInstanceOf(ChatHistoryError);
        expect((error as ChatHistoryError).status).toBe(409);
        expect((error as Error).message).toBe("历史游标不属于当前文档");
      }
    }
  });

  it("拒绝超过问题上限的输入且不落盘空占位", () => {
    const doc = document();

    try {
      beginDocumentChatTurn(doc, { path: doc.path, action: "send", content: "x".repeat(4_001) }, 5_000);
      throw new Error("expected question length error");
    } catch (error) {
      expect(error).toBeInstanceOf(ChatHistoryError);
      expect((error as ChatHistoryError).status).toBe(413);
    }

    expect(getDocumentChatHistory(doc)).toMatchObject({ conversationId: null, messages: [], isGenerating: false });
  });
});
