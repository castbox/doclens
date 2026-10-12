import { describe, expect, it } from "vitest";
import { selectChatContext } from "./chatContext";
import { MAX_CHAT_HISTORY_CHARS, MAX_CHAT_MESSAGES, type ChatTurn } from "./types";

describe("selectChatContext", () => {
  it("接受首次概述前的空历史", () => {
    expect(selectChatContext([])).toEqual([]);
  });

  it("保留初始概述、最近完整问答和当前问题，并在40条预算内裁剪旧问答", () => {
    const history: ChatTurn[] = [
      { role: "assistant", content: "首轮概述" },
      ...Array.from({ length: 24 }, (_, index) => [
        { role: "user" as const, content: `问题 ${index}` },
        { role: "assistant" as const, content: `回答 ${index}` }
      ]).flat(),
      { role: "user", content: "最新问题" }
    ];
    const historyBefore = history.map((turn) => ({ ...turn }));
    const selected = selectChatContext(history);

    expect(history).toEqual(historyBefore);
    expect(history).toHaveLength(50);
    expect(selected).toHaveLength(MAX_CHAT_MESSAGES);
    expect(selected[0]).toEqual({ role: "assistant", content: "首轮概述" });
    expect(selected[1]).toEqual({ role: "user", content: "问题 5" });
    expect(selected[selected.length - 1]).toEqual({ role: "user", content: "最新问题" });
    expect(selected.every((turn, index) => index === 0 || selected[index - 1].role !== turn.role)).toBe(true);
  });

  it("在100000字符预算内保留完整最近问答，并在必要时截去旧上下文", () => {
    const history: ChatTurn[] = [
      { role: "assistant", content: "s".repeat(32_000) },
      ...Array.from({ length: 20 }, (_, index) => [
        { role: "user" as const, content: `问题 ${index}`.padEnd(100, "q") },
        { role: "assistant" as const, content: `回答 ${index}`.padEnd(4_000, "a") }
      ]).flat(),
      { role: "user", content: "当前问题".padEnd(100, "q") }
    ];
    const selected = selectChatContext(history);

    expect(selected[0]).toEqual(history[0]);
    expect(selected[1].content).toContain("问题 4");
    expect(selected[selected.length - 1]).toEqual(history[history.length - 1]);
    expect(selected.reduce((total, turn) => total + turn.content.length, 0)).toBeLessThanOrEqual(MAX_CHAT_HISTORY_CHARS);
    expect(selected.every((turn, index) => index === 0 || selected[index - 1].role !== turn.role)).toBe(true);
    expect(history).toHaveLength(42);
  });

  it("拒绝无法组成当前user结尾与完整问答对的历史", () => {
    expect(() => selectChatContext([{ role: "assistant", content: "未结束的回答" }])).toThrow(/end with a user/);
    expect(() =>
      selectChatContext([
        { role: "user", content: "问题一" },
        { role: "user", content: "问题二" }
      ])
    ).toThrow(/roles must alternate/);
  });
});
