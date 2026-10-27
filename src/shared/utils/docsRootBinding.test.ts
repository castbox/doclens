import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearConfigCache, getConfig } from "./env";
import { readDocsRootBinding } from "./docsRootBinding";

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: "0"
    }
  }).trim();
}

async function initMainRepo(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.name", "DocLens Test"]);
  runGit(root, ["config", "user.email", "doclens@example.com"]);
  runGit(root, ["remote", "add", "origin", "https://github.com/castbox/ai-generation-flow.git"]);
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.writeFile(path.join(root, "docs", "guide.md"), "# guide\n", "utf8");
  await fs.writeFile(path.join(root, "README.md"), "# main\n", "utf8");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "initial"]);
}

async function writeBinding(dbPath: string, target: string): Promise<string> {
  const bindingPath = path.join(path.dirname(dbPath), ".doclens-main-root");
  await fs.mkdir(path.dirname(bindingPath), { recursive: true });
  await fs.writeFile(bindingPath, `${target}\n`, "utf8");
  return bindingPath;
}

describe("docs root binding", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    clearConfigCache();
    delete process.env.DOCLENS_DOCS_ROOT;
    delete process.env.DOCLENS_DB_PATH;

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("没有绑定文件时保持现有环境变量行为", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-binding-absent-"));
    const fallbackRoot = path.join(tempDir, "fallback");
    const dbPath = path.join(tempDir, "instance", "doclens.sqlite");
    await fs.mkdir(path.join(fallbackRoot, "docs"), { recursive: true });

    process.env.DOCLENS_DOCS_ROOT = fallbackRoot;
    process.env.DOCLENS_DB_PATH = dbPath;
    clearConfigCache();

    expect(getConfig().docsRoot).toBe(fallbackRoot);
  });

  it("有效绑定覆盖旧环境变量，且只影响其数据库实例", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-binding-main-"));
    const mainRoot = path.join(tempDir, "main-root");
    const fallbackRoot = path.join(tempDir, "fallback");
    const dbPath = path.join(tempDir, "instance-a", "doclens.sqlite");
    await initMainRepo(mainRoot);
    await fs.mkdir(path.join(fallbackRoot, "docs"), { recursive: true });
    await writeBinding(dbPath, mainRoot);

    process.env.DOCLENS_DOCS_ROOT = fallbackRoot;
    process.env.DOCLENS_DB_PATH = dbPath;
    clearConfigCache();

    const canonicalMainRoot = await fs.realpath(mainRoot);
    expect(getConfig().docsRoot).toBe(canonicalMainRoot);
    expect(getConfig().docsRootMode).toBe("project-root");

    process.env.DOCLENS_DB_PATH = path.join(tempDir, "instance-b", "doclens.sqlite");
    clearConfigCache();
    expect(getConfig().docsRoot).toBe(fallbackRoot);
  });

  it("拒绝相对路径、错误仓库、非 main 和脏工作树", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-binding-invalid-"));
    const mainRoot = path.join(tempDir, "main-root");
    await initMainRepo(mainRoot);
    const dbPath = path.join(tempDir, "instance", "doclens.sqlite");
    const bindingPath = await writeBinding(dbPath, "relative/path");

    expect(() => readDocsRootBinding(dbPath)).toThrowError(/absolute path/);

    await fs.writeFile(bindingPath, `${mainRoot}\n`, "utf8");
    const canonicalMainRoot = await fs.realpath(mainRoot);
    expect(readDocsRootBinding(dbPath)).toBe(canonicalMainRoot);

    runGit(mainRoot, ["switch", "-c", "feature"]);
    expect(() => readDocsRootBinding(dbPath)).toThrowError(/branch main/);

    runGit(mainRoot, ["switch", "main"]);
    await fs.writeFile(path.join(mainRoot, "untracked.txt"), "dirty\n", "utf8");
    expect(() => readDocsRootBinding(dbPath)).toThrowError(/clean main worktree/);
  });

  it("拒绝错误仓库和符号链接绑定文件", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-binding-repo-"));
    const otherRoot = path.join(tempDir, "other-root");
    await initMainRepo(otherRoot);
    runGit(otherRoot, ["remote", "set-url", "origin", "https://github.com/castbox/doclens.git"]);
    const dbPath = path.join(tempDir, "instance", "doclens.sqlite");
    const bindingPath = await writeBinding(dbPath, otherRoot);

    expect(() => readDocsRootBinding(dbPath)).toThrowError(/must be ai-generation-flow/);

    await fs.unlink(bindingPath);
    await fs.symlink(otherRoot, bindingPath);
    expect(() => readDocsRootBinding(dbPath)).toThrowError(/regular file/);
  });

  it("缓存命中后会重新校验 main 并拒绝工作树变脏", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "doclens-binding-cache-"));
    const mainRoot = path.join(tempDir, "main-root");
    const dbPath = path.join(tempDir, "instance", "doclens.sqlite");
    await initMainRepo(mainRoot);
    await writeBinding(dbPath, mainRoot);
    process.env.DOCLENS_DB_PATH = dbPath;
    process.env.DOCLENS_DOCS_ROOT = path.join(tempDir, "fallback");
    clearConfigCache();

    const canonicalMainRoot = await fs.realpath(mainRoot);
    expect(getConfig().docsRoot).toBe(canonicalMainRoot);
    await fs.writeFile(path.join(mainRoot, "README.md"), "# changed\n", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect(() => getConfig()).toThrowError(/clean main worktree/);
  });
});
