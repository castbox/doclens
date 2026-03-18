import { describe, expect, it } from "vitest";
import {
  shouldRefreshLatestPrFilesOnSelectionChange,
  shouldReusePrFilesCache,
  type PrFilesCacheSnapshot
} from "@/features/reviews/domain/prFilesCache";

function createSnapshot(loadedAt: number): PrFilesCacheSnapshot {
  return {
    files: [],
    categories: [],
    loadedAt
  };
}

describe("shouldReusePrFilesCache", () => {
  it("没有缓存时返回 false", () => {
    expect(shouldReusePrFilesCache(null, 10_000, 60_000)).toBe(false);
  });

  it("缓存仍在复用窗口内时返回 true", () => {
    expect(shouldReusePrFilesCache(createSnapshot(10_000), 20_000, 60_000)).toBe(true);
  });

  it("缓存超过复用窗口时返回 false", () => {
    expect(shouldReusePrFilesCache(createSnapshot(10_000), 70_000, 60_000)).toBe(false);
  });
});

describe("shouldRefreshLatestPrFilesOnSelectionChange", () => {
  it("切换到非 PR 路径时不刷新", () => {
    expect(shouldRefreshLatestPrFilesOnSelectionChange("pr/2025/foo.md", "design/bar.md")).toBe(false);
  });

  it("切换到新的 PR 路径时刷新", () => {
    expect(shouldRefreshLatestPrFilesOnSelectionChange("pr/2025/foo.md", "pr/2025/bar.md")).toBe(true);
  });

  it("回到同一路径时不重复刷新", () => {
    expect(shouldRefreshLatestPrFilesOnSelectionChange("pr/2025/foo.md", "pr/2025/foo.md")).toBe(false);
  });
});
