"use client";

import * as React from "react";
import { Alert, Paper, Stack } from "@mui/material";
import type { SearchFileType, SearchResult, SearchSort } from "@/features/search/domain/types";
import { SearchBar } from "@/features/search/ui/SearchBar";
import { SearchResultList } from "@/features/search/ui/SearchResultList";
import { LoadingState } from "@/shared/ui/StateCard";

type SearchPanelProps = {
  initialQuery?: string;
  initialType?: SearchFileType;
  initialSort?: SearchSort;
  scope?: string;
  onOpenHit: (path: string, line: number) => void;
};

export function SearchPanel({
  initialQuery = "",
  initialType = "all",
  initialSort = "relevance",
  scope = "",
  onOpenHit
}: SearchPanelProps): React.JSX.Element {
  const [query, setQuery] = React.useState(initialQuery);
  const [type, setType] = React.useState<SearchFileType>(initialType);
  const [sort, setSort] = React.useState<SearchSort>(initialSort);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<SearchResult | null>(null);

  React.useEffect(() => {
    if (!query.trim()) {
      setResult(null);
      setError("");
      return;
    }

    const timer = setTimeout(() => {
      const controller = new AbortController();

      const load = async () => {
        setLoading(true);
        setError("");

        try {
          const params = new URLSearchParams({
            q: query,
            page: String(page),
            size: "20",
            type,
            sort
          });

          if (scope) {
            params.set("scope", scope);
          }

          const response = await fetch(`/api/search?${params.toString()}`, {
            signal: controller.signal
          });

          const payload = (await response.json()) as SearchResult & { error?: string };
          if (!response.ok) {
            throw new Error(payload.error ?? "搜索失败");
          }

          setResult(payload);
        } catch (searchError) {
          if (searchError instanceof DOMException && searchError.name === "AbortError") {
            return;
          }

          setError(searchError instanceof Error ? searchError.message : "搜索失败");
        } finally {
          setLoading(false);
        }
      };

      void load();

      return () => {
        controller.abort();
      };
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [page, query, scope, sort, type]);

  return (
    <Stack gap={1.25}>
      <Paper variant="outlined" sx={{ p: 1.2 }}>
        <SearchBar
          query={query}
          type={type}
          sort={sort}
          onQueryChange={(value) => {
            setPage(1);
            setQuery(value);
          }}
          onTypeChange={(value) => {
            setPage(1);
            setType(value);
          }}
          onSortChange={(value) => {
            setPage(1);
            setSort(value);
          }}
        />
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <LoadingState label="检索中..." /> : null}
      {!loading && result ? (
        <SearchResultList
          result={result}
          onOpenHit={onOpenHit}
          onPageChange={(nextPage) => {
            setPage(nextPage);
          }}
        />
      ) : null}
    </Stack>
  );
}
