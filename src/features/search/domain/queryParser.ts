export function parseSearchTerms(rawQuery: string): string[] {
  const query = rawQuery.trim();
  if (!query) {
    return [];
  }

  const terms: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    const value = (match[1] ?? match[2] ?? "").trim();
    if (value) {
      terms.push(value);
    }
  }

  return terms;
}
