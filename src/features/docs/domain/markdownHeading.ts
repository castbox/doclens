import matter from "gray-matter";

export function extractMarkdownTitle(content: string, fallback: string): string {
  const parsed = matter(content);

  if (typeof parsed.data.title === "string" && parsed.data.title.trim()) {
    return parsed.data.title.trim();
  }

  const heading = parsed.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  if (!heading) {
    return fallback;
  }

  return heading.replace(/^#\s+/, "").trim() || fallback;
}
