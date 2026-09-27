// Clipboard API is missing outside secure contexts (for example http://<lan-ip>).
// Fall back to execCommand synchronously so a click can still copy.

export async function copyTextToClipboard(text: string): Promise<void> {
  if (canUseClipboardApi()) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denial or an embedded browser can reject writeText.
      // Try the legacy path before giving up.
    }
  }

  if (!copyWithExecCommand(text)) {
    throw new Error("clipboard unavailable");
  }
}

function canUseClipboardApi(): boolean {
  return (
    globalThis.isSecureContext === true &&
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function"
  );
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function" || !document.body) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.fontSize = "12pt";

  const selection = document.getSelection?.() ?? null;
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    if (selection) {
      selection.removeAllRanges();
      if (previousRange) {
        selection.addRange(previousRange);
      }
    }
  }

  return copied;
}
