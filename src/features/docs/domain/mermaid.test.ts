import { describe, expect, it } from "vitest";
import { isMermaidLanguage, normalizeCodeBlockSource } from "./mermaid";

describe("isMermaidLanguage", () => {
  it("识别标准 mermaid 语言标记", () => {
    expect(isMermaidLanguage("language-mermaid")).toBe(true);
  });

  it("识别大小写混合的 mermaid 标记", () => {
    expect(isMermaidLanguage("language-MERMAID")).toBe(true);
  });

  it("识别包含多个 className 的 mermaid 标记", () => {
    expect(isMermaidLanguage("hljs language-mermaid extra")).toBe(true);
  });

  it("排除非 mermaid 语言标记", () => {
    expect(isMermaidLanguage("language-typescript")).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
  });
});

describe("normalizeCodeBlockSource", () => {
  it("会统一换行并去除代码块尾部单个换行", () => {
    expect(normalizeCodeBlockSource("graph TD\r\nA-->B\r\n")).toBe("graph TD\nA-->B");
  });

  it("保留无尾换行内容", () => {
    expect(normalizeCodeBlockSource("sequenceDiagram")).toBe("sequenceDiagram");
  });
});
