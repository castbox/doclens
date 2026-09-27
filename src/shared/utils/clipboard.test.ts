import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

type FakeTextarea = {
  value: string;
  style: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  focus: () => void;
  select: () => void;
  setSelectionRange: (start: number, end: number) => void;
  remove: () => void;
};

describe("copyTextToClipboard", () => {
  const originalSecureContext = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext");
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

  afterEach(() => {
    restoreProperty(globalThis, "isSecureContext", originalSecureContext);
    restoreProperty(navigator, "clipboard", originalClipboard);
    restoreProperty(globalThis, "document", originalDocument);
    vi.restoreAllMocks();
  });

  it("uses navigator.clipboard.writeText in a secure context", async () => {
    const writeText = vi.fn(async () => undefined);
    setSecureContext(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    await copyTextToClipboard("docs/prd/doclens_prd.md");

    expect(writeText).toHaveBeenCalledWith("docs/prd/doclens_prd.md");
  });

  it("falls back to execCommand when clipboard is undefined", async () => {
    const fake = createFakeDocument();
    setSecureContext(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fake.document
    });

    await copyTextToClipboard("docs/prd/doclens_prd.md");

    expect(fake.textarea.value).toBe("docs/prd/doclens_prd.md");
    expect(fake.execCommand).toHaveBeenCalledWith("copy");
    expect(fake.removed).toBe(true);
  });

  it("falls back when writeText rejects", async () => {
    const fake = createFakeDocument();
    setSecureContext(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("NotAllowedError");
        })
      }
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fake.document
    });

    await copyTextToClipboard("repo/path.md");

    expect(fake.textarea.value).toBe("repo/path.md");
    expect(fake.execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws when neither clipboard API nor execCommand can copy", async () => {
    setSecureContext(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined
    });

    await expect(copyTextToClipboard("docs/prd/doclens_prd.md")).rejects.toThrow("clipboard unavailable");
  });
});

function setSecureContext(value: boolean): void {
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value
  });
}

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  delete (target as Record<string, unknown>)[key];
}

function createFakeDocument(): {
  textarea: FakeTextarea;
  document: Pick<Document, "body" | "createElement" | "execCommand" | "getSelection">;
  execCommand: ReturnType<typeof vi.fn>;
  removed: boolean;
} {
  let removed = false;
  const textarea: FakeTextarea = {
    value: "",
    style: {},
    setAttribute() {},
    focus() {},
    select() {},
    setSelectionRange() {},
    remove() {
      removed = true;
    }
  };
  const execCommand = vi.fn(() => true);

  return {
    textarea,
    execCommand,
    get removed() {
      return removed;
    },
    document: {
      body: {
        appendChild() {}
      } as unknown as HTMLElement,
      createElement() {
        return textarea as unknown as HTMLTextAreaElement;
      },
      execCommand,
      getSelection() {
        return null;
      }
    }
  };
}
