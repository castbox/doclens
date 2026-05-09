import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearConfigCache } from "@/shared/utils/env";
import { resolveDocsPath } from "./pathRules";

describe("resolveDocsPath", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    clearConfigCache();
    delete process.env.DOCLENS_DOCS_ROOT;

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("允许 docs root 内相对路径", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    const result = resolveDocsPath("prd/doclens_prd.md");
    expect(result.relativePath).toBe("prd/doclens_prd.md");
    expect(result.repositoryPath).toBe("docs/prd/doclens_prd.md");
    expect(result.absolutePath.endsWith("docs/prd/doclens_prd.md")).toBe(true);
  });

  it("允许 DOCLENS_DOCS_ROOT 指向项目根目录并保留仓库相对路径", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-project-root-"));
    await fs.mkdir(path.join(tempDir, "docs", "pr", "20260509"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "docs", "pr", "20260509", "example.md"), "# example\n", "utf8");
    process.env.DOCLENS_DOCS_ROOT = tempDir;
    clearConfigCache();

    const result = resolveDocsPath("docs/pr/20260509/example.md");
    expect(result.docsRoot).toBe(tempDir);
    expect(result.relativePath).toBe("docs/pr/20260509/example.md");
    expect(result.repositoryPath).toBe("docs/pr/20260509/example.md");
    expect(result.absolutePath).toBe(path.join(tempDir, "docs", "pr", "20260509", "example.md"));
  });

  it("配置到 docs 目录时也接受带 docs 前缀的仓库相对路径", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    const result = resolveDocsPath("docs/prd/doclens_prd.md");
    expect(result.relativePath).toBe("prd/doclens_prd.md");
    expect(result.repositoryPath).toBe("docs/prd/doclens_prd.md");
  });

  it("拒绝路径穿越", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    expect(() => resolveDocsPath("../package.json")).toThrowError(/Path traversal/);
  });

  it("拒绝绝对路径", () => {
    process.env.DOCLENS_DOCS_ROOT = "./docs";

    expect(() => resolveDocsPath("/etc/passwd")).toThrowError(/Absolute path/);
  });

  it("拒绝默认忽略目录下的直接路径", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-ignored-path-"));
    await fs.mkdir(path.join(tempDir, "docs", ".git"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "docs", ".git", "ignored.md"), "# ignored\n", "utf8");
    process.env.DOCLENS_DOCS_ROOT = tempDir;
    clearConfigCache();

    expect(() => resolveDocsPath(".git/ignored.md")).toThrowError(/Path is ignored/);
  });
});
