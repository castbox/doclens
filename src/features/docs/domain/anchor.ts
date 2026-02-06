export type LocationAnchor = {
  line?: number;
  heading?: string;
};

export function parseLocationAnchor(hashValue: string | null | undefined): LocationAnchor {
  if (!hashValue) {
    return {};
  }

  const cleanHash = hashValue.startsWith("#") ? hashValue.slice(1) : hashValue;

  if (/^L\d+$/i.test(cleanHash)) {
    return { line: Number.parseInt(cleanHash.slice(1), 10) };
  }

  if (cleanHash.startsWith("heading-")) {
    return { heading: decodeURIComponent(cleanHash.slice("heading-".length)) };
  }

  return {};
}

export function buildLineAnchor(line: number): string {
  return `#L${line}`;
}
