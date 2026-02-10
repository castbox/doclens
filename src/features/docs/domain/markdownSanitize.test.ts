import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarkdownPreview from "@uiw/react-markdown-preview";
import rehypeSanitize from "rehype-sanitize";
import { markdownSanitizeSchema } from "./markdownSanitize";

function renderMarkdown(source: string): string {
  return renderToStaticMarkup(
    React.createElement(MarkdownPreview, {
      source,
      disableCopy: true,
      pluginsFilter: (type: "rehype" | "remark", plugins) => {
        if (type !== "rehype") {
          return plugins;
        }

        return [...plugins, [rehypeSanitize, markdownSanitizeSchema]];
      }
    })
  );
}

describe("markdownSanitizeSchema", () => {
  it("保留白名单内 HTML 标签", () => {
    const html = renderMarkdown("<details><summary>概要</summary><p>正文</p></details>");

    expect(html).toContain("<details>");
    expect(html).toContain("<summary>概要</summary>");
    expect(html).toContain("<p>正文</p>");
  });

  it("剔除脚本标签与事件属性", () => {
    const html = renderMarkdown('<script>alert(1)</script><img src="docs/a.png" onerror="alert(2)" />');

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<img");
  });

  it("阻断危险协议链接", () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">危险链接</a>');

    expect(html).toContain("危险链接");
    expect(html).not.toContain("javascript:");
  });
});
