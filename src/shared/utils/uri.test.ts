import { describe, expect, it } from "vitest";
import { safeDecodeURIComponent } from "./uri";

describe("safeDecodeURIComponent", () => {
  it("会解码合法的 percent 编码", () => {
    expect(safeDecodeURIComponent("%E8%8C%83%E5%9B%B4")).toBe("范围");
    expect(safeDecodeURIComponent("100%25")).toBe("100%");
  });

  it("遇到非法 percent 编码时保留原始文本", () => {
    expect(safeDecodeURIComponent("tencent%")).toBe("tencent%");
    expect(safeDecodeURIComponent("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
