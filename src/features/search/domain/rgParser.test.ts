import { describe, expect, it } from "vitest";
import { parseRgJsonOutput } from "./rgParser";
import { highlightSnippet } from "./resultHighlighter";

describe("parseRgJsonOutput", () => {
  it("解析 rg json match 事件", () => {
    const stdout = [
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "/repo/docs/prd/doclens_prd.md" },
          lines: { text: "DocLens 提供浏览、搜索与审阅" },
          line_number: 22,
          submatches: [{ start: 0, end: 7 }]
        }
      })
    ].join("\n");

    const hits = parseRgJsonOutput(stdout, "/repo/docs");
    expect(hits).toEqual([
      {
        path: "prd/doclens_prd.md",
        line: 22,
        column: 1,
        snippet: "DocLens 提供浏览、搜索与审阅"
      }
    ]);
  });
});

describe("highlightSnippet", () => {
  it("对关键词进行高亮", () => {
    const html = highlightSnippet("DocLens review workflow", ["review"]);
    expect(html).toContain("<mark>review</mark>");
  });

  it("自动转义 html", () => {
    const html = highlightSnippet("<script>alert(1)</script>", ["alert"]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
