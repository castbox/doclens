// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyTextToClipboard,
  type ClipboardRuntime
} from "./clipboardService";

const TEXT = "第一行\n第二行";

function installExecCommand(
  implementation: () => boolean
): ReturnType<typeof vi.fn> {
  const execCommand = vi.fn(implementation);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
    writable: true
  });
  return execCommand;
}

function createRuntime(overrides: ClipboardRuntime = {}): ClipboardRuntime {
  return {
    document,
    isSecureContext: true,
    ...overrides
  };
}

afterEach(() => {
  Reflect.deleteProperty(document, "execCommand");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("copyTextToClipboard", () => {
  it("uses the Clipboard API in a secure context", async () => {
    const writeText = vi.fn(async () => undefined);
    const execCommand = installExecCommand(() => true);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ writeText })
    );

    expect(result).toEqual({ ok: true, method: "clipboard-api" });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("uses the synchronous fallback when the Clipboard API is unavailable", async () => {
    let copiedValue = "";
    installExecCommand(() => {
      copiedValue = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ isSecureContext: false })
    );

    expect(result).toEqual({ ok: true, method: "exec-command" });
    expect(copiedValue).toBe(TEXT);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("skips the Clipboard API outside a secure context", async () => {
    const writeText = vi.fn(async () => undefined);
    installExecCommand(() => true);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ isSecureContext: false, writeText })
    );

    expect(result).toEqual({ ok: true, method: "exec-command" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back when the Clipboard API rejects", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    installExecCommand(() => true);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ writeText })
    );

    expect(result).toEqual({ ok: true, method: "exec-command" });
    expect(writeText).toHaveBeenCalledOnce();
  });

  it("reports a permission failure when both copy paths fail", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    installExecCommand(() => false);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ writeText })
    );

    expect(result).toEqual({ ok: false, reason: "permission-denied" });
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("cleans up when the fallback command throws", async () => {
    installExecCommand(() => {
      throw new Error("copy failed");
    });

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ isSecureContext: false })
    );

    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("restores focus and selection after using the fallback", async () => {
    const source = document.createElement("input");
    source.value = "0123456789";
    document.body.appendChild(source);
    source.focus();
    source.setSelectionRange(2, 6, "backward");
    installExecCommand(() => true);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ isSecureContext: false })
    );

    expect(result.ok).toBe(true);
    expect(document.activeElement).toBe(source);
    expect([source.selectionStart, source.selectionEnd]).toEqual([2, 6]);
    expect(source.selectionDirection).toBe("backward");
  });

  it("keeps a successful copy result when focus restoration throws", async () => {
    const source = document.createElement("input");
    document.body.appendChild(source);
    source.focus();
    vi.spyOn(source, "focus").mockImplementation(() => {
      throw new Error("focus failed");
    });
    installExecCommand(() => true);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ isSecureContext: false })
    );

    expect(result).toEqual({ ok: true, method: "exec-command" });
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("does not copy empty text", async () => {
    const writeText = vi.fn(async () => undefined);
    const execCommand = installExecCommand(() => true);

    const result = await copyTextToClipboard("", createRuntime({ writeText }));

    expect(result).toEqual({ ok: false, reason: "empty" });
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("returns unavailable when neither browser copy method exists", async () => {
    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ document: undefined, isSecureContext: false })
    );

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns unavailable when an insecure context has no legacy copy", async () => {
    const writeText = vi.fn(async () => undefined);

    const result = await copyTextToClipboard(
      TEXT,
      createRuntime({ isSecureContext: false, writeText })
    );

    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(writeText).not.toHaveBeenCalled();
  });
});
