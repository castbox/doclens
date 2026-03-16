import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetDbClientForTests } from "@/db/client";
import { resetDocStatesRepoForTests } from "@/features/docs/services/docStatesRepo";
import { setDocStarStatus } from "@/features/docs/services/docStarsRepo";
import { resetPrFileCreatedAtCachesForTests } from "@/features/reviews/services/prFileCreatedAt";
import { clearConfigCache } from "@/shared/utils/env";
import { listPrFiles, markPrFileRead, resetPrFilesRepoForTests, syncPrFilesSnapshot } from "./prFilesRepo";

function runGit(cwd: string, args: string[], extraEnv?: Record<string, string>): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv
    }
  }).trim();
}

function initGitRepo(cwd: string): void {
  runGit(cwd, ["init"]);
  runGit(cwd, ["config", "user.name", "DocLens Test"]);
  runGit(cwd, ["config", "user.email", "doclens@example.com"]);
}

function commitAll(cwd: string, isoTime: string, message: string): void {
  runGit(cwd, ["add", "."]);
  runGit(cwd, ["commit", "-m", message], {
    GIT_AUTHOR_DATE: isoTime,
    GIT_COMMITTER_DATE: isoTime
  });
}

describe("prFilesRepo 状态持久化", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    resetDbClientForTests();
    resetDocStatesRepoForTests();
    resetPrFilesRepoForTests();
    resetPrFileCreatedAtCachesForTests();
    clearConfigCache();
    delete process.env.DOCLENS_DOCS_ROOT;
    delete process.env.DOCLENS_DB_PATH;

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("PR 快照重建后仍能保留已读和星标状态", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-pr-states-"));
    const docsRoot = tempDir;
    const dbPath = path.join(tempDir, "data", "doclens.sqlite");
    const relativePath = "pr/20260317/perf/example.md";
    const absolutePath = path.join(docsRoot, "pr", "20260317", "perf", "example.md");

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "# example\n", "utf8");

    process.env.DOCLENS_DOCS_ROOT = docsRoot;
    process.env.DOCLENS_DB_PATH = dbPath;
    clearConfigCache();
    resetDbClientForTests();

    await syncPrFilesSnapshot();
    await setDocStarStatus(relativePath, true);

    const marked = await markPrFileRead(relativePath, true);
    expect(marked?.isStarred).toBe(true);
    expect(marked?.isRead).toBe(true);

    await fs.rm(absolutePath, { force: true });
    await new Promise((resolve) => {
      setTimeout(resolve, 1100);
    });
    await syncPrFilesSnapshot();
    expect(await listPrFiles()).toEqual([]);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "# example restored\n", "utf8");
    await syncPrFilesSnapshot();

    const rows = await listPrFiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe(relativePath);
    expect(rows[0]?.isStarred).toBe(true);
    expect(rows[0]?.isRead).toBe(true);
  });

  it("创建时间优先使用 frontmatter created_at", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-pr-created-frontmatter-"));
    const docsRoot = tempDir;
    const dbPath = path.join(tempDir, "data", "doclens.sqlite");
    const relativePath = "pr/20260317/perf/20250303-frontmatter-priority.md";
    const absolutePath = path.join(docsRoot, "pr", "20260317", "perf", "20250303-frontmatter-priority.md");
    const frontmatterCreatedAt = "2026-01-08T09:30:00.000Z";

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, ["---", `created_at: ${frontmatterCreatedAt}`, "---", "", "# example"].join("\n"), "utf8");

    initGitRepo(docsRoot);
    commitAll(docsRoot, "2024-01-02T03:04:05.000Z", "add pr doc with frontmatter");

    process.env.DOCLENS_DOCS_ROOT = docsRoot;
    process.env.DOCLENS_DB_PATH = dbPath;
    clearConfigCache();
    resetDbClientForTests();
    resetDocStatesRepoForTests();
    resetPrFilesRepoForTests();
    resetPrFileCreatedAtCachesForTests();

    await syncPrFilesSnapshot();
    const rows = await listPrFiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe(relativePath);
    expect(rows[0]?.createdAt).toBe(frontmatterCreatedAt);
  });

  it("创建时间在没有 frontmatter 时优先使用 Git 首次提交时间", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-pr-created-git-"));
    const docsRoot = tempDir;
    const dbPath = path.join(tempDir, "data", "doclens.sqlite");
    const relativePath = "pr/20260317/perf/20250303-git-priority.md";
    const absolutePath = path.join(docsRoot, "pr", "20260317", "perf", "20250303-git-priority.md");
    const gitCreatedAt = "2024-02-03T04:05:06.000Z";

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "# git priority\n", "utf8");

    initGitRepo(docsRoot);
    commitAll(docsRoot, gitCreatedAt, "add pr doc without frontmatter");

    process.env.DOCLENS_DOCS_ROOT = docsRoot;
    process.env.DOCLENS_DB_PATH = dbPath;
    clearConfigCache();
    resetDbClientForTests();
    resetDocStatesRepoForTests();
    resetPrFilesRepoForTests();
    resetPrFileCreatedAtCachesForTests();

    await syncPrFilesSnapshot();
    const rows = await listPrFiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe(relativePath);
    expect(rows[0]?.createdAt).toBe(gitCreatedAt);
  });

  it("创建时间在没有 frontmatter 和 Git 历史时回退到文件名日期", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-pr-created-filename-"));
    const docsRoot = tempDir;
    const dbPath = path.join(tempDir, "data", "doclens.sqlite");
    const relativePath = "pr/20260317/perf/20241225-filename-priority.md";
    const absolutePath = path.join(docsRoot, "pr", "20260317", "perf", "20241225-filename-priority.md");

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, "# filename priority\n", "utf8");

    process.env.DOCLENS_DOCS_ROOT = docsRoot;
    process.env.DOCLENS_DB_PATH = dbPath;
    clearConfigCache();
    resetDbClientForTests();
    resetDocStatesRepoForTests();
    resetPrFilesRepoForTests();
    resetPrFileCreatedAtCachesForTests();

    await syncPrFilesSnapshot();
    const rows = await listPrFiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe(relativePath);
    expect(rows[0]?.createdAt).toBe("2024-12-25T00:00:00.000Z");
  });
});
