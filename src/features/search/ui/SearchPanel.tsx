"use client";

import * as React from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
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
  const hasQuery = query.trim().length > 0;

  React.useEffect(() => {
    if (!hasQuery) {
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
  }, [hasQuery, page, query, scope, sort, type]);

  return (
    <Stack gap={1.25}>
      <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.2 }, bgcolor: "rgba(255,255,255,0.9)" }}>
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
      {!loading && !error && !result && !hasQuery ? (
        <Paper variant="outlined" sx={{ p: 1.4, bgcolor: "rgba(238,243,248,0.6)" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            输入关键词后将实时检索文档内容，支持类型过滤和排序。
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {["worktree sop", "upload wizard", "unity rate limit"].map((keyword) => (
              <Typography
                key={keyword}
                component="button"
                type="button"
                onClick={() => {
                  setQuery(keyword);
                  setPage(1);
                }}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 10,
                  px: 1,
                  py: 0.35,
                  fontSize: 12.5,
                  color: "text.secondary",
                  backgroundColor: "background.paper",
                  cursor: "pointer",
                  transition: "background-color 180ms ease, border-color 180ms ease",
                  "&:hover": {
                    borderColor: "primary.light",
                    backgroundColor: "action.hover"
                  }
                }}
              >
                {keyword}
              </Typography>
            ))}
          </Box>
        </Paper>
      ) : null}
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
