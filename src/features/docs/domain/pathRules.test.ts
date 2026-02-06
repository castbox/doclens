import { afterEach, describe, expect, it } from "vitest";
import { clearConfigCache } from "@/shared/utils/env";
import { resolveDocsPath } from "./pathRules";

describe("resolveDocsPath", () => {
  afterEach(() => {
    clearConfigCache();
    delete process.env.DOCLENS_DOCS_ROOT;
  });

  it("允许 docs root 内相对路径", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    const result = resolveDocsPath("prd/doclens_prd.md");
    expect(result.relativePath).toBe("prd/doclens_prd.md");
    expect(result.absolutePath.endsWith("docs/prd/doclens_prd.md")).toBe(true);
  });

  it("拒绝路径穿越", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    expect(() => resolveDocsPath("../package.json")).toThrowError(/Path traversal/);
  });

  it("拒绝绝对路径", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    expect(() => resolveDocsPath("/etc/passwd")).toThrowError(/Absolute path/);
  });
});
