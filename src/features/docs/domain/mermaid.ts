const MERMAID_LANGUAGE_PATTERN = /(^|\s)language-mermaid(\s|$)/i;

export function isMermaidLanguage(className?: string): boolean {
  if (!className) {
    return false;
  }

  return MERMAID_LANGUAGE_PATTERN.test(className);
}

export function normalizeCodeBlockSource(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n$/, "");
}
