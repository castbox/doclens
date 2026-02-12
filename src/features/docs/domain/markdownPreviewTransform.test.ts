import { describe, expect, it } from "vitest";
import {
  autoLinkDocsMarkdownPaths,
  buildAnchorHash,
  normalizeDocsRelativePath,
  preserveDiffSectionLineBreaks,
  resolveMarkdownDocPath
} from "./markdownPreviewTransform";

describe("markdownPreviewTransform", () => {
  it("会将普通 docs markdown 路径自动转为链接", () => {
    const input = "见 docs/prd/doclens_prd.md#scope 了解范围";
    const result = autoLinkDocsMarkdownPaths(input);

    expect(result).toContain("[docs/prd/doclens_prd.md#scope](docs/prd/doclens_prd.md#scope)");
  });

  it("仅对 docs 前缀路径做自动补链", () => {
    const input = "相对 ./a.md 上级 ../b.md 绝对 /c.md 与 docs/prd/doclens_prd.md";
    const result = autoLinkDocsMarkdownPaths(input);

    expect(result).toContain("./a.md");
    expect(result).toContain("../b.md");
    expect(result).toContain("/c.md");
    expect(result).toContain("[docs/prd/doclens_prd.md](docs/prd/doclens_prd.md)");
  });

  it("不会改写代码块和行内代码中的路径", () => {
    const input = [
      "`docs/prd/doclens_prd.md`",
      "```md",
      "docs/prd/doclens_prd.md",
      "```"
    ].join("\n");

    const result = autoLinkDocsMarkdownPaths(input);

    expect(result).toContain("`docs/prd/doclens_prd.md`");
    expect(result).toContain("```md\ndocs/prd/doclens_prd.md\n```");
    expect(result).not.toContain("[docs/prd/doclens_prd.md](docs/prd/doclens_prd.md)");
  });

  it("不会二次改写已有 markdown 链接", () => {
    const input = "[说明](docs/prd/doclens_prd.md)";
    const result = autoLinkDocsMarkdownPaths(input);

    expect(result).toBe(input);
  });

  it("能够按当前文档解析相对 markdown 链接", () => {
    const currentPath = "prd/feature/plan.md";

    expect(resolveMarkdownDocPath("../doclens_prd.md", currentPath)).toBe("prd/doclens_prd.md");
    expect(resolveMarkdownDocPath("docs/prd/doclens_prd.md", currentPath)).toBe("prd/doclens_prd.md");
    expect(resolveMarkdownDocPath("/prd/doclens_prd.md", currentPath)).toBe("prd/doclens_prd.md");
  });

  it("会拒绝越界和非 markdown 链接", () => {
    const currentPath = "prd/feature/plan.md";

    expect(resolveMarkdownDocPath("../../../secret.md", currentPath)).toBeNull();
    expect(resolveMarkdownDocPath("https://example.com/a.md", currentPath)).toBeNull();
    expect(resolveMarkdownDocPath("./image.png", currentPath)).toBeNull();
  });

  it("会保留 Diff 章节中纯文本段落的显式换行", () => {
    const input = ["## 关键 Diff（自检）", "第一行", "- 列表项", "", "普通段落"].join("\n");
    const result = preserveDiffSectionLineBreaks(input);

    expect(result).toContain("第一行  ");
    expect(result).toContain("- 列表项\n");
  });

  it("normalizeDocsRelativePath 能处理标准化与越界", () => {
    expect(normalizeDocsRelativePath("./prd/../prd/doclens_prd.md")).toBe("prd/doclens_prd.md");
    expect(normalizeDocsRelativePath("../doclens_prd.md")).toBeNull();
  });

  it("buildAnchorHash 会提取并解码锚点", () => {
    expect(buildAnchorHash("docs/prd/doclens_prd.md#%E8%8C%83%E5%9B%B4")).toBe("范围");
    expect(buildAnchorHash("docs/prd/doclens_prd.md")).toBe("");
  });
});
