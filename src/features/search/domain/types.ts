export type SearchFileType = "all" | "md" | "code" | "pdf";
export type SearchSort = "relevance" | "mtime";

export type SearchRequest = {
  q: string;
  scope?: string;
  type?: SearchFileType;
  page?: number;
  size?: number;
  sort?: SearchSort;
};

export type SearchHit = {
  path: string;
  line: number;
  column: number;
  snippet: string;
  highlightedSnippet: string;
};

export type SearchResult = {
  query: string;
  total: number;
  page: number;
  size: number;
  tookMs: number;
  hits: SearchHit[];
};
