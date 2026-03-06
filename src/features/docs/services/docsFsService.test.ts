import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearConfigCache } from "@/shared/utils/env";
import { readFilePreview } from "./docsFsService";

describe("readFilePreview", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    clearConfigCache();
    delete process.env.DOCLENS_DOCS_ROOT;
    delete process.env.DOCLENS_MAX_FILE_PREVIEW_BYTES;
    delete process.env.DOCLENS_MAX_FILE_PREVIEW_LINES;

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("默认仅预览阈值内内容，但支持按需读取完整文本", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-preview-"));
    const filePath = path.join(tempDir, "large.txt");
    const content = ["line-1", "line-2", "line-3", "line-4", "line-5"].join("\n");

    await fs.writeFile(filePath, content, "utf8");

    process.env.DOCLENS_DOCS_ROOT = tempDir;
    process.env.DOCLENS_MAX_FILE_PREVIEW_BYTES = "16";
    process.env.DOCLENS_MAX_FILE_PREVIEW_LINES = "3";
    clearConfigCache();

    const preview = await readFilePreview("large.txt");
    expect(preview.truncated).toBe(true);
    expect(preview.truncatedLines).toBe(2);
    expect(preview.content).toBe(["line-1", "line-2", "line-3"].join("\n"));

    const full = await readFilePreview("large.txt", { fullContent: true });
    expect(full.truncated).toBe(false);
    expect(full.truncatedLines).toBe(0);
    expect(full.content).toBe(content);
  });
});
