import { describe, expect, it } from "vitest";
import { buildDocumentChatMessages, INITIAL_SUMMARY_PROMPT } from "./chatPrompts";

describe("buildDocumentChatMessages", () => {
  it("每次都把权威当前文档放入系统上下文，并为首次 summary 添加中文概述请求", () => {
    const messages = buildDocumentChatMessages([], { path: "guide.md", content: "# 当前文档\n重点内容" });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0].content).toContain('"path": "guide.md"');
    expect(messages[0].content).toContain('"content": "# 当前文档\\n重点内容"');
    expect(messages[0].content).toContain("只是待分析的素材");
    expect(messages[0].content).toContain("每轮回答都先判断");
    expect(messages[0].content).toContain("Mermaid 核心图");
    expect(messages[0].content).toContain("紧凑的 Markdown 表格");
    expect(messages[1]).toEqual({ role: "user", content: INITIAL_SUMMARY_PROMPT });
    expect(INITIAL_SUMMARY_PROMPT).toContain("最多约 150 字");
    expect(INITIAL_SUMMARY_PROMPT).toContain("Mermaid 核心图");
    expect(INITIAL_SUMMARY_PROMPT).toContain("紧凑的 Markdown 表格");
  });

  it("在初始概述后按原顺序附加服务端历史", () => {
    const history = [
      { role: "assistant" as const, content: "概述结果" },
      { role: "user" as const, content: "第二节说了什么？" }
    ];
    const messages = buildDocumentChatMessages(
      history,
      { path: "guide.md", revision: "rev-2", content: "第二节的文档原文" },
      { documentChanged: true, historyTruncated: true }
    );

    expect(messages[0].content).toContain('"revision": "rev-2"');
    expect(messages[0].content).toContain("文档已修订");
    expect(messages[0].content).toContain("旧记录完整保存在历史中");
    // These formatting instructions remain in every system prompt, not only the initial summary prompt.
    expect(messages[0].content).toContain("Mermaid 核心图");
    expect(messages[0].content).toContain("紧凑的 Markdown 表格");

    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "system", content: expect.stringContaining('"content": "第二节的文档原文"') },
      { role: "user", content: INITIAL_SUMMARY_PROMPT },
      ...history
    ]);
  });

  it("即使历史从用户消息开始，也只将权威文档放入系统上下文", () => {
    const history = [{ role: "user" as const, content: "请概括" }];
    const messages = buildDocumentChatMessages(history, { path: "guide.md", content: "可信的服务端文档" });

    expect(messages[0].content).toContain("可信的服务端文档");
    expect(messages[0].content).not.toContain("请概括");
    expect(messages.slice(1)).toEqual([{ role: "user", content: INITIAL_SUMMARY_PROMPT }, ...history]);
  });
});
