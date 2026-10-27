export type ClipboardCopyResult =
  | {
      ok: true;
      method: "clipboard-api" | "exec-command";
    }
  | {
      ok: false;
      reason: "empty" | "unavailable" | "permission-denied" | "failed";
    };

export type ClipboardRuntime = {
  document?: Document;
  isSecureContext?: boolean;
  writeText?: (text: string) => Promise<void>;
};

type SelectableElement = HTMLElement & {
  selectionDirection?: "forward" | "backward" | "none";
  selectionEnd: number | null;
  selectionStart: number | null;
  setSelectionRange: (
    start: number,
    end: number,
    direction?: "forward" | "backward" | "none"
  ) => void;
};

function isPermissionError(error: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

function isSelectableElement(element: HTMLElement | null): element is SelectableElement {
  return Boolean(
    element &&
      "selectionStart" in element &&
      "selectionEnd" in element &&
      typeof (element as SelectableElement).setSelectionRange === "function"
  );
}

function copyWithExecCommand(doc: Document, text: string): boolean {
  const body = doc.body;
  if (!body || typeof doc.execCommand !== "function") {
    return false;
  }

  const activeElement =
    doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const selectableElement = isSelectableElement(activeElement)
    ? activeElement
    : null;
  const selectableState = selectableElement
    ? {
        direction: selectableElement.selectionDirection,
        end: selectableElement.selectionEnd,
        start: selectableElement.selectionStart
      }
    : null;
  const selection = doc.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange()
      )
    : [];

  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.inputMode = "none";
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.spellcheck = false;
  textarea.setAttribute("aria-label", "剪贴板复制辅助输入");
  textarea.style.cssText = [
    "position:fixed",
    "top:0",
    "left:-9999px",
    "width:1px",
    "height:1px",
    "opacity:0",
    "font-size:16px",
    "pointer-events:none"
  ].join(";");

  let copied = false;
  try {
    body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    copied = doc.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    try {
      textarea.remove();
    } catch {
      // Cleanup must not convert a successful copy into a reported failure.
    }

    try {
      if (activeElement && typeof activeElement.focus === "function") {
        activeElement.focus({ preventScroll: true });
      }

      if (selection && ranges.length > 0) {
        selection.removeAllRanges();
        for (const range of ranges) {
          selection.addRange(range);
        }
      }

      if (selectableElement && selectableState) {
        const start = selectableState.start ?? 0;
        const end = selectableState.end ?? start;
        selectableElement.setSelectionRange(
          start,
          end,
          selectableState.direction
        );
      }
    } catch {
      // Focus/selection restoration is best effort and must not affect the result.
    }
  }

  return copied;
}

function resolveClipboardRuntime(): ClipboardRuntime {
  const clipboard =
    typeof navigator === "undefined" ? undefined : navigator.clipboard;

  return {
    document: typeof document === "undefined" ? undefined : document,
    isSecureContext:
      typeof window === "undefined" ? undefined : window.isSecureContext,
    writeText:
      clipboard && typeof clipboard.writeText === "function"
        ? (text) => clipboard.writeText(text)
        : undefined
  };
}

export async function copyTextToClipboard(
  text: string,
  runtime?: ClipboardRuntime
): Promise<ClipboardCopyResult> {
  if (!text) {
    return { ok: false, reason: "empty" };
  }

  let resolvedRuntime: ClipboardRuntime;
  try {
    resolvedRuntime = runtime ?? resolveClipboardRuntime();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  let clipboardError: unknown;
  const clipboardAvailable =
    typeof resolvedRuntime.writeText === "function" &&
    resolvedRuntime.isSecureContext !== false;

  if (clipboardAvailable) {
    try {
      await resolvedRuntime.writeText!(text);
      return { ok: true, method: "clipboard-api" };
    } catch (error) {
      clipboardError = error;
    }
  }

  const legacyAvailable =
    Boolean(resolvedRuntime.document) &&
    typeof resolvedRuntime.document?.execCommand === "function";

  if (legacyAvailable) {
    try {
      if (copyWithExecCommand(resolvedRuntime.document!, text)) {
        return { ok: true, method: "exec-command" };
      }
    } catch {
      // The legacy copy helper handles its own errors; this keeps the contract total.
    }
  }

  if (isPermissionError(clipboardError)) {
    return { ok: false, reason: "permission-denied" };
  }

  if (!clipboardAvailable && !legacyAvailable) {
    return { ok: false, reason: "unavailable" };
  }

  return { ok: false, reason: "failed" };
}
