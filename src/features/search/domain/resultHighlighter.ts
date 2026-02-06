function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightSnippet(snippet: string, terms: string[]): string {
  if (!snippet || terms.length === 0) {
    return escapeHtml(snippet);
  }

  const escapedSnippet = escapeHtml(snippet);
  const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");

  return escapedSnippet.replace(pattern, "<mark>$1</mark>");
}
