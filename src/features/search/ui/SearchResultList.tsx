"use client";

import * as React from "react";
import { Box, Chip, List, ListItemButton, ListItemText, Pagination, Paper, Stack, Typography } from "@mui/material";
import type { SearchResult } from "@/features/search/domain/types";
import { EmptyState } from "@/shared/ui/StateCard";

export function SearchResultList({
  result,
  onOpenHit,
  onPageChange
}: {
  result: SearchResult;
  onOpenHit: (path: string, line: number) => void;
  onPageChange: (page: number) => void;
}): React.JSX.Element {
  if (result.total === 0) {
    return <EmptyState title="没有匹配结果" description="可以尝试缩短关键词、切换文件类型，或更换目录范围后重试" />;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.size));

  return (
    <Stack gap={1.25}>
      <Stack direction="row" gap={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          共 {result.total} 条，耗时 {result.tookMs}ms
        </Typography>
        <Chip size="small" variant="outlined" label={`page ${result.page}/${totalPages}`} />
      </Stack>

      <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "rgba(255,255,255,0.9)" }}>
        <List disablePadding>
          {result.hits.map((hit) => (
            <React.Fragment key={`${hit.path}:${hit.line}:${hit.column}`}>
              <ListItemButton
                sx={{
                  alignItems: "flex-start",
                  py: 1.1,
                  px: 1.25,
                  cursor: "pointer",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  transition: "background-color 180ms ease, border-color 180ms ease",
                  "&:hover": {
                    bgcolor: "action.hover"
                  }
                }}
                onClick={() => {
                  onOpenHit(hit.path, hit.line);
                }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
                      <Typography className="mono" variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                        {hit.path}
                      </Typography>
                      <Chip size="small" label={`L${hit.line}`} variant="outlined" />
                    </Stack>
                  }
                  secondary={
                    <Box sx={{ mt: 0.75 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        component="div"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          "& mark": {
                            backgroundColor: "rgba(15,23,42,0.1)",
                            color: "#0F172A",
                            px: 0.25,
                            borderRadius: 0.5
                          }
                        }}
                        dangerouslySetInnerHTML={{ __html: hit.highlightedSnippet }}
                      />
                    </Box>
                  }
                />
              </ListItemButton>
            </React.Fragment>
          ))}
        </List>
      </Paper>

      <Stack alignItems="flex-end">
        <Pagination
          count={totalPages}
          page={result.page}
          onChange={(_event, page) => {
            onPageChange(page);
          }}
          shape="rounded"
          color="primary"
        />
      </Stack>
    </Stack>
  );
}
