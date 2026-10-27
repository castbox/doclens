import { describe, expect, it } from "vitest";
import { parseLocationAnchor } from "./anchor";

describe("parseLocationAnchor", () => {
  it("会解码合法的 heading 锚点", () => {
    expect(parseLocationAnchor("#heading-%E8%8C%83%E5%9B%B4")).toEqual({ heading: "范围" });
    expect(parseLocationAnchor("#heading-100%25")).toEqual({ heading: "100%" });
  });

  it("遇到非法 percent 编码时保留原始 heading", () => {
    expect(parseLocationAnchor("#heading-进度100%")).toEqual({ heading: "进度100%" });
    expect(parseLocationAnchor("#heading-%E0%A4%A")).toEqual({ heading: "%E0%A4%A" });
  });
});
