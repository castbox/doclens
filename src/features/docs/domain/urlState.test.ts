import { describe, expect, it } from "vitest";
import { isPathWithinScope, normalizeDocsRouteState } from "./urlState";

describe("isPathWithinScope", () => {
  it("目录前缀命中时返回 true", () => {
    expect(isPathWithinScope("pr/20260212/asset-library/a.md", "pr/20260212/asset-library")).toBe(true);
  });

  it("不同目录时返回 false", () => {
    expect(isPathWithinScope("pr/20260212/other/a.md", "pr/20260212/asset-library")).toBe(false);
  });

  it("会把 docs 前缀作为仓库路径别名归一化", () => {
    expect(isPathWithinScope("docs/pr/20260212/asset-library/a.md", "pr/20260212/asset-library")).toBe(true);
  });
});

describe("normalizeDocsRouteState", () => {
  it("仅 path 且为目录时迁移为 scope", () => {
    const result = normalizeDocsRouteState({
      path: "pr/20260212/asset-library",
      pathNodeType: "directory"
    });

    expect(result.scopePath).toBe("pr/20260212/asset-library");
    expect(result.path).toBe("");
    expect(result.changed).toBe(true);
  });

  it("scope 是文件时回退到 path", () => {
    const result = normalizeDocsRouteState({
      scopePath: "pr/20260212/asset-library/readme.md",
      scopeNodeType: "file"
    });

    expect(result.scopePath).toBe("");
    expect(result.path).toBe("pr/20260212/asset-library/readme.md");
    expect(result.changed).toBe(true);
  });

  it("scope+path 不在同一子树时清理 path", () => {
    const result = normalizeDocsRouteState({
      scopePath: "pr/20260212/asset-library",
      path: "pr/20260212/another/readme.md"
    });

    expect(result.scopePath).toBe("pr/20260212/asset-library");
    expect(result.path).toBe("");
    expect(result.changed).toBe(true);
  });

  it("合法 scope+path 保持不变", () => {
    const result = normalizeDocsRouteState({
      scopePath: "pr/20260212/asset-library",
      path: "pr/20260212/asset-library/readme.md",
      scopeNodeType: "directory",
      pathNodeType: "file"
    });

    expect(result.scopePath).toBe("pr/20260212/asset-library");
    expect(result.path).toBe("pr/20260212/asset-library/readme.md");
    expect(result.changed).toBe(false);
  });

  it("会把 URL 中的 docs 前缀归一化为 docs 内相对路径", () => {
    const result = normalizeDocsRouteState({
      scopePath: "docs/pr/20260212/asset-library",
      path: "docs/pr/20260212/asset-library/readme.md",
      scopeNodeType: "directory",
      pathNodeType: "file"
    });

    expect(result.scopePath).toBe("pr/20260212/asset-library");
    expect(result.path).toBe("pr/20260212/asset-library/readme.md");
    expect(result.changed).toBe(true);
  });

  it("docs 根路径会归一化为空路径", () => {
    const result = normalizeDocsRouteState({
      path: "docs",
      pathNodeType: "directory"
    });

    expect(result.scopePath).toBe("");
    expect(result.path).toBe("");
    expect(result.changed).toBe(true);
  });

  it("path 不存在时清理 path", () => {
    const result = normalizeDocsRouteState({
      path: "pr/20260212/asset-library/missing.md",
      pathNodeType: null
    });

    expect(result.scopePath).toBe("");
    expect(result.path).toBe("");
    expect(result.changed).toBe(true);
  });
});
