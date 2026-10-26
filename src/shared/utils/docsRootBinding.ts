import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BINDING_FILE_NAME = ".doclens-main-root";
const EXPECTED_REPOSITORY = /(?:^|[/:])castbox\/ai-generation-flow(?:\.git)?$/;

export class DocsRootBindingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DocsRootBindingError";
    this.code = code;
  }
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0"
      }
    }).trim();
  } catch {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_GIT_FAILED", "DocLens root binding Git check failed");
  }
}

function resolveBoundWorktree(rawPath: string): string {
  if (!rawPath || rawPath.includes("\0") || !path.isAbsolute(rawPath)) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_INVALID", "DocLens root binding must contain an absolute path");
  }

  let boundRoot: string;
  try {
    boundRoot = fs.realpathSync(rawPath);
  } catch {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_INVALID", "DocLens root binding target does not exist");
  }

  if (!fs.statSync(boundRoot).isDirectory()) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_INVALID", "DocLens root binding target is not a directory");
  }

  const worktreeRoot = runGit(boundRoot, ["rev-parse", "--show-toplevel"]);
  if (fs.realpathSync(worktreeRoot) !== boundRoot) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_INVALID", "DocLens root binding target must be a Git worktree root");
  }

  const originUrl = runGit(boundRoot, ["remote", "get-url", "origin"]).replace(/\/+$/, "");
  if (!EXPECTED_REPOSITORY.test(originUrl)) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_WRONG_REPO", "DocLens root binding target must be ai-generation-flow");
  }

  const branch = runGit(boundRoot, ["branch", "--show-current"]);
  if (branch !== "main") {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_NOT_MAIN", "DocLens root binding requires branch main");
  }

  const head = runGit(boundRoot, ["rev-parse", "HEAD"]);
  const mainHead = runGit(boundRoot, ["rev-parse", "refs/heads/main"]);
  if (head !== mainHead) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_HEAD_DRIFT", "DocLens root binding HEAD differs from local refs/heads/main");
  }

  const status = runGit(boundRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_DIRTY", "DocLens root binding requires a clean main worktree");
  }

  return boundRoot;
}

export function readDocsRootBinding(dbPath: string): string | null {
  const bindingPath = path.join(path.dirname(dbPath), BINDING_FILE_NAME);
  let stats: fs.Stats;

  try {
    stats = fs.lstatSync(bindingPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_INVALID", "DocLens root binding cannot be inspected");
  }

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new DocsRootBindingError("DOCLENS_ROOT_BINDING_INVALID", "DocLens root binding must be a regular file");
  }

  return resolveBoundWorktree(fs.readFileSync(bindingPath, "utf8").trim());
}
