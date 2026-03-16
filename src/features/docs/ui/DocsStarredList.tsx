"use client";

import * as React from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { Alert, Box, Chip, CircularProgress, IconButton, List, ListItemButton, ListItemIcon, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { isPathWithinScope } from "@/features/docs/domain/urlState";
import type { StarredDocRecord } from "@/features/docs/domain/types";
import { formatDateTime } from "@/shared/domain/time";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";

type StarsPayload = {
  stars?: StarredDocRecord[];
  error?: string;
};

export function DocsStarredList({
  selectedPath,
  scopePath = "",
  refreshToken,
  onSelectFile,
  onStarChanged
}: {
  selectedPath: string;
  scopePath?: string;
  refreshToken: number;
  onSelectFile: (path: string) => void;
  onStarChanged?: (path: string, isStarred: boolean) => void;
}): React.JSX.Element {
  const normalizedScopePath = React.useMemo(() => scopePath.split("/").filter(Boolean).join("/"), [scopePath]);
  const [rows, setRows] = React.useState<StarredDocRecord[]>([]);
  const [filter, setFilter] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pendingPath, setPendingPath] = React.useState("");
  const hasLoadedOnceRef = React.useRef(false);

  const loadStars = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError("");
    }

    try {
      const response = await fetch("/api/docs/stars");
      const payload = (await response.json()) as StarsPayload;
      if (!response.ok || !payload.stars) {
        throw new Error(payload.error ?? "加载星标文档失败");
      }

      setRows(payload.stars);
      hasLoadedOnceRef.current = true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载星标文档失败");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadStars({ silent: hasLoadedOnceRef.current });
  }, [loadStars, refreshToken]);

  const scopedRows = React.useMemo(() => {
    return rows.filter((row) => {
      if (!normalizedScopePath) {
        return true;
      }

      return isPathWithinScope(row.path, normalizedScopePath);
    });
  }, [normalizedScopePath, rows]);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleRows = React.useMemo(() => {
    if (!normalizedFilter) {
      return scopedRows;
    }

    return scopedRows.filter((row) => {
      const fileName = row.name.toLowerCase();
      const filePath = row.path.toLowerCase();
      return fileName.includes(normalizedFilter) || filePath.includes(normalizedFilter);
    });
  }, [normalizedFilter, scopedRows]);

  const handleToggleStar = React.useCallback(
    async (path: string) => {
      setPendingPath(path);
      setError("");

      try {
        const response = await fetch("/api/docs/stars", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, isStarred: false })
        });
        const payload = (await response.json()) as { path?: string; isStarred?: boolean; error?: string };
        if (!response.ok || payload.path !== path || payload.isStarred !== false) {
          throw new Error(payload.error ?? "取消星标失败");
        }

        setRows((prev) => prev.filter((item) => item.path !== path));
        onStarChanged?.(path, false);
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "取消星标失败");
      } finally {
        setPendingPath("");
      }
    },
    [onStarChanged]
  );

  const hasKeywordFilter = normalizedFilter.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          按最近星标时间倒序
        </Typography>
        <Chip label={hasKeywordFilter ? `${visibleRows.length}/${scopedRows.length} 项` : `${scopedRows.length} 项`} size="small" color="warning" variant="outlined" />
      </Stack>

      <TextField
        placeholder="筛选星标文档"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
        size="small"
        inputProps={{ "aria-label": "filter starred docs" }}
        sx={{ mb: 1 }}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {refreshing ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          正在后台刷新星标文档...
        </Typography>
      ) : null}
      {normalizedScopePath ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          当前目录范围：{normalizedScopePath}
        </Typography>
      ) : null}

      {loading ? <LoadingState label="加载星标文档..." /> : null}

      {!loading && visibleRows.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState title="暂无星标文档" description="可在文档详情页或 PR 文件面板中将重点文件加入星标" />
        ) : normalizedScopePath && scopedRows.length === 0 ? (
          <EmptyState title="当前目录范围内暂无星标文档" description="可切换目录范围，或从文档详情页继续补充星标" />
        ) : hasKeywordFilter ? (
          <EmptyState title="没有匹配的星标文档" description="可尝试缩短关键词，或清空筛选条件后重试" />
        ) : (
          <EmptyState title="暂无星标文档" description="可在文档详情页或 PR 文件面板中将重点文件加入星标" />
        )
      ) : null}

      {!loading && visibleRows.length > 0 ? (
        <List disablePadding sx={{ pr: 0.25, overflowY: "auto", minHeight: 0, maxHeight: "calc(100dvh - 238px)" }}>
          {visibleRows.map((row) => (
            <ListItemButton
              key={row.path}
              onClick={() => onSelectFile(row.path)}
              sx={{
                alignItems: "flex-start",
                mb: 0.5,
                px: 1,
                py: 0.9,
                borderRadius: 1.2,
                border: "1px solid",
                borderColor: selectedPath === row.path ? "warning.main" : "divider",
                bgcolor: selectedPath === row.path ? "rgba(255,247,215,0.82)" : "transparent",
                "&:hover": {
                  bgcolor: selectedPath === row.path ? "rgba(255,243,199,0.92)" : "rgba(255,251,235,0.72)"
                },
                transition: "background-color 180ms ease, border-color 180ms ease"
              }}
            >
              <ListItemIcon sx={{ minWidth: 28, color: selectedPath === row.path ? "warning.dark" : "text.secondary", mt: 0.15 }}>
                <DescriptionOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
                  <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {row.name}
                  </Typography>
                  <Tooltip title="取消星标">
                    <span>
                      <IconButton
                        size="small"
                        aria-label="remove doc star from drawer"
                        sx={{
                          width: 36,
                          height: 36,
                          border: "1px solid",
                          borderColor: "warning.main",
                          color: "warning.dark",
                          bgcolor: "rgba(245,158,11,0.12)",
                          flexShrink: 0
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleToggleStar(row.path);
                        }}
                        disabled={pendingPath === row.path}
                      >
                        {pendingPath === row.path ? <CircularProgress size={16} color="inherit" /> : <StarRoundedIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                <Typography variant="caption" color="text.secondary" className="mono" sx={{ display: "block", overflowWrap: "anywhere" }}>
                  {row.path}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  星标：{formatDateTime(row.starredAt)}
                </Typography>
              </Box>
            </ListItemButton>
          ))}
        </List>
      ) : null}
    </Box>
  );
}
