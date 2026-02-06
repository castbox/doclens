import matter from "gray-matter";
import GithubSlugger from "github-slugger";

export type MarkdownHeading = {
  level: number;
  text: string;
  slug: string;
  line: number;
};

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

function normalizeHeadingText(raw: string): string {
  return raw.replace(/\s+#+\s*$/, "").trim();
}

export function extractMarkdownHeadings(markdown: string, maxCount = 40): MarkdownHeading[] {
  const slugger = new GithubSlugger();
  const headings: MarkdownHeading[] = [];
  const lines = markdown.split(/\r?\n/);

  let inFence = false;
  let fenceMarker = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }

    if (inFence) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (!headingMatch) {
      continue;
    }

    const level = headingMatch[1].length;
    const text = normalizeHeadingText(headingMatch[2]);
    const slug = slugger.slug(text);

    headings.push({
      level,
      text,
      slug,
      line: index + 1
    });

    if (headings.length >= maxCount) {
      break;
    }
  }

  return headings;
}
