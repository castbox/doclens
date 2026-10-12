import { describe, expect, it } from "vitest";
import { createSseParser } from "./chatStream";

describe("createSseParser", () => {
  it("解析跨 chunk 的 CRLF 与多行 data，并忽略注释和空事件段", () => {
    const received: string[] = [];
    const parser = createSseParser((data) => received.push(data));

    parser.push(": keep-alive\r\ndata: 第一行\r");
    parser.push("\ndata:第二行\r\n\r\n\r\ndata: [DONE]\r\n\r\n");
    parser.finish();

    expect(received).toEqual(["第一行\n第二行", "[DONE]"]);
  });

  it("支持 LF、CR、BOM 和没有冒号的 data 字段", () => {
    const received: string[] = [];
    const parser = createSseParser((data) => received.push(data));

    parser.push("\uFEFFdata\ndata: value\n\n");
    parser.push("data: cr\r\r");
    parser.finish();

    expect(received).toEqual(["\nvalue", "cr"]);
  });

  it("EOF 丢弃没有空行终止的事件", () => {
    const received: string[] = [];
    const parser = createSseParser((data) => received.push(data));

    parser.push("data: incomplete\n");
    parser.finish();

    expect(received).toEqual([]);
  });

  it("finish 后忽略输入且可重复调用", () => {
    const received: string[] = [];
    const parser = createSseParser((data) => received.push(data));

    parser.finish();
    parser.push("data: ignored\n\n");
    parser.finish();

    expect(received).toEqual([]);
  });
});
