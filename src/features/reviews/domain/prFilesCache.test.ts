import { describe, expect, it } from "vitest";
import { shouldReusePrFilesCache, type PrFilesCacheSnapshot } from "@/features/reviews/domain/prFilesCache";

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
