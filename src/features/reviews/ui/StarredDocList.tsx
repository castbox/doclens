"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { Button, Chip, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import type { StarredDocRecord } from "@/features/docs/domain/types";
import { formatDateTime } from "@/shared/domain/time";

export function StarredDocList({
  rows,
  activeDocPath,
  pendingPath,
  onSelectDoc,
  onToggleStar
}: {
  rows: StarredDocRecord[];
  activeDocPath: string;
  pendingPath: string;
  onSelectDoc: (path: string) => void;
  onToggleStar: (path: string, isStarred: boolean) => void;
}): React.JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Stack spacing={0.2}>
            <Typography variant="subtitle1" fontWeight={700}>
              星标文档
            </Typography>
            <Typography variant="body2" color="text.secondary">
              汇总在 PR 面板或文档详情页中加入星标的文件
            </Typography>
          </Stack>
          <Chip label={`${rows.length} 项`} size="small" color="warning" variant="outlined" />
        </Stack>

        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            暂无星标文档。
          </Typography>
        ) : (
          <Stack spacing={0.9}>
            {rows.map((row) => (
              <Paper
                key={row.path}
                variant="outlined"
                sx={{
                  px: 1,
                  py: 0.9,
                  bgcolor: activeDocPath === row.path ? "rgba(255,247,215,0.86)" : "rgba(255,251,235,0.55)",
                  borderColor: activeDocPath === row.path ? "warning.main" : "rgba(245,158,11,0.28)"
                }}
              >
                <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" gap={1}>
                  <Stack spacing={0.3} sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>
                      {row.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="mono" sx={{ overflowWrap: "anywhere" }}>
                      {row.path}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      星标时间：{formatDateTime(row.starredAt)}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                    <Button
                      size="small"
                      variant={activeDocPath === row.path ? "contained" : "outlined"}
                      color={activeDocPath === row.path ? "warning" : "inherit"}
                      onClick={() => {
                        onSelectDoc(row.path);
                      }}
                    >
                      带入筛选
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      component={Link}
                      href={`/docs?path=${encodeURIComponent(row.path)}`}
                      endIcon={<OpenInNewIcon />}
                      sx={{ flexShrink: 0 }}
                    >
                      打开文档
                    </Button>
                    <Tooltip title="取消星标">
                      <span>
                        <IconButton
                          size="small"
                          aria-label="remove star"
                          sx={{
                            width: 40,
                            height: 40,
                            border: "1px solid",
                            borderColor: "warning.main",
                            color: "warning.dark",
                            bgcolor: "rgba(245,158,11,0.12)"
                          }}
                          onClick={() => {
                            onToggleStar(row.path, true);
                          }}
                          disabled={pendingPath === row.path}
                        >
                          {pendingPath === row.path ? <CircularProgress size={16} color="inherit" /> : <StarRoundedIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
