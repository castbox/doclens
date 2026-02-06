import path from "node:path";

type RgMatchEntry = {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{ start: number; end: number }>;
  };
};

type RgEvent = RgMatchEntry | { type: string };

export type ParsedRgHit = {
  path: string;
  line: number;
  column: number;
  snippet: string;
};

export function parseRgJsonOutput(stdout: string, docsRoot: string): ParsedRgHit[] {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hits: ParsedRgHit[] = [];

  for (const line of lines) {
    let event: RgEvent;
    try {
      event = JSON.parse(line) as RgEvent;
    } catch {
      continue;
    }

    if (event.type !== "match" || !("data" in event)) {
      continue;
    }

    const absolutePath = event.data.path.text;
    const relativePath = path.relative(docsRoot, absolutePath).split(path.sep).join(path.posix.sep);
    const firstSubmatch = event.data.submatches[0];

    hits.push({
      path: relativePath,
      line: event.data.line_number,
      column: firstSubmatch ? firstSubmatch.start + 1 : 1,
      snippet: event.data.lines.text.trimEnd()
    });
  }

  return hits;
}
