import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearConfigCache } from "@/shared/utils/env";
import { searchDocs } from "./rgSearchService";
import { resetSearchCacheForTests } from "./searchCacheService";

function hasRipgrep(): boolean {
  try {
    execFileSync("rg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("searchDocs", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    clearConfigCache();
    resetSearchCacheForTests();
    delete process.env.DOCLENS_DOCS_ROOT;

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  (hasRipgrep() ? it : it.skip)("项目根目录模式只搜索仓库 Markdown，并包含未忽略的隐藏目录", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-project-root-search-"));
    await fs.mkdir(path.join(tempDir, "docs"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".agents"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".agents", "notes.md"), "needle-project-root-md\n", "utf8");
    await fs.writeFile(path.join(tempDir, ".git", "ignored.md"), "needle-project-root-md\n", "utf8");
    await fs.writeFile(path.join(tempDir, "src", "code.ts"), "needle-project-root-md\n", "utf8");

    process.env.DOCLENS_DOCS_ROOT = tempDir;
    clearConfigCache();

    const result = await searchDocs({ q: "needle-project-root-md", size: 20 });
    expect(result.hits.map((hit) => hit.path)).toEqual([".agents/notes.md"]);
  });
});
