import { describe, expect, it } from "vitest";
import { buildDocExportFileName, buildDocExportHtml, buildDocExportModel, buildInfoContentHtml } from "./docExport";
import type { FilePreviewPayload } from "./types";

describe("docExport", () => {
  it("builds export filename from source path", () => {
    expect(buildDocExportFileName("prd/doclens_prd.md", "docx")).toBe("doclens_prd-详情页.docx");
  });

  it("sanitizes invalid filename characters", () => {
    expect(buildDocExportFileName("spec/a:b*c?.md", "doc")).toBe("a-b-c--详情页.doc");
  });

  it("renders html document with metadata and content", () => {
    const payload: FilePreviewPayload = {
      path: "prd/doclens_prd.md",
      name: "doclens_prd.md",
      kind: "markdown",
      size: 2048,
      modifiedAt: "2026-03-09T09:15:00.000Z",
      truncated: false,
      truncatedLines: 0,
      content: "# DocLens"
    };

    const html = buildDocExportHtml(buildDocExportModel(payload, buildInfoContentHtml("正文示例"), new Date("2026-03-09T10:00:00.000Z")));

    expect(html).toContain("DocLens 文档详情页导出");
    expect(html).toContain("docs/prd/doclens_prd.md");
    expect(html).toContain("正文示例");
  });
});
