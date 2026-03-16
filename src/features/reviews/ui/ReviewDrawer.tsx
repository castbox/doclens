"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import LaunchIcon from "@mui/icons-material/Launch";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { PrFileReadFilter, PrFileRecord, PrFileStarUpdate } from "@/features/reviews/domain/types";
import { formatDateTime } from "@/shared/domain/time";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";

type PrFilesPayload = {
  files?: PrFileRecord[];
  categories?: string[];
  error?: string;
};

type ReviewDrawerTab = "all" | "starred";

const DRAWER_WIDTH = 360;
const APP_HEADER_HEIGHT = 64;
const REFRESH_INTERVAL_MS = 60_000;

const PrFileListItem = React.memo(function PrFileListItem({
  item,
  selectedPath,
  showStarredAt,
  isPending,
  onOpenFile,
  onToggleStar
}: {
  item: PrFileRecord;
  selectedPath: string;
  showStarredAt: boolean;
  isPending: boolean;
  onOpenFile: (path: string) => void;
  onToggleStar: (path: string, isStarred: boolean) => void;
}): React.JSX.Element {
  return (
    <ListItemButton
      onClick={() => onOpenFile(item.path)}
      sx={{
        position: "relative",
        mb: 0.8,
        borderRadius: 1.2,
        border: "1px solid",
        borderColor: selectedPath === item.path ? "primary.main" : "divider",
        bgcolor: selectedPath === item.path ? "rgba(11,114,133,0.08)" : "transparent",
        py: 1,
        "&::before": {
          content: '""',
          width: 8,
          height: 8,
          borderRadius: "50%",
          position: "absolute",
          left: 10,
          top: 14,
          backgroundColor: item.isRead ? "success.main" : "warning.main"
        },
        "&:hover": {
          bgcolor: selectedPath === item.path ? "rgba(11,114,133,0.12)" : "action.hover"
        },
        transition: "background-color 180ms ease, border-color 180ms ease"
      }}
    >
      <ListItemText
        sx={{ pl: 1.25 }}
        primary={
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
            <Tooltip title={item.name} placement="top-start" arrow>
              <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
                {item.name}
              </Typography>
            </Tooltip>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title={item.isStarred ? "取消星标" : "加入星标"}>
                <span>
                  <IconButton
                    size="small"
                    aria-label={item.isStarred ? "remove pr star" : "add pr star"}
                    aria-pressed={item.isStarred}
                    sx={{
                      width: 40,
                      height: 40,
                      border: "1px solid",
                      borderColor: item.isStarred ? "warning.main" : "divider",
                      color: item.isStarred ? "warning.dark" : "text.secondary",
                      bgcolor: item.isStarred ? "rgba(245,158,11,0.12)" : "background.paper"
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggleStar(item.path, item.isStarred);
                    }}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : item.isStarred ? (
                      <StarRoundedIcon fontSize="small" />
                    ) : (
                      <StarBorderRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              <Chip label={item.isRead ? "已读" : "未读"} size="small" color={item.isRead ? "success" : "warning"} variant="outlined" />
            </Stack>
          </Stack>
        }
        secondary={
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              类别：{item.category}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              创建：{formatDateTime(item.createdAt)}
            </Typography>
            {showStarredAt && item.starredAt ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                星标：{formatDateTime(item.starredAt)}
              </Typography>
            ) : null}
          </>
        }
      />
    </ListItemButton>
  );
});

export function ReviewDrawer({
  open,
  onOpenChange,
  selectedPath,
  onOpenFile,
  externalStarUpdate,
  onStarChanged
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPath: string;
  onOpenFile: (path: string) => void;
  externalStarUpdate?: PrFileStarUpdate | null;
  onStarChanged?: (path: string, isStarred: boolean, starredAt?: string | null) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const isLgUp = useMediaQuery(theme.breakpoints.up("lg"));
  const [allFiles, setAllFiles] = React.useState<PrFileRecord[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [activeTab, setActiveTab] = React.useState<ReviewDrawerTab>("all");
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [readFilter, setReadFilter] = React.useState<PrFileReadFilter>("all");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [starPendingPath, setStarPendingPath] = React.useState("");
  const hasLoadedOnceRef = React.useRef(false);
  const listContainerRef = React.useRef<HTMLDivElement | null>(null);

  const loadFiles = React.useCallback(async (options?: { silent?: boolean; forceSync?: boolean }) => {
    const silent = options?.silent ?? false;
    const forceSync = options?.forceSync ?? false;
    setError("");
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch(forceSync ? "/api/reviews/pr-files?refresh=1" : "/api/reviews/pr-files");
      const payload = (await response.json()) as PrFilesPayload;
      if (!response.ok || !payload.files || !payload.categories) {
        throw new Error(payload.error ?? "加载 PR 文件失败");
      }

      setAllFiles(payload.files);
      setCategories(payload.categories);
      hasLoadedOnceRef.current = true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载 PR 文件失败");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    void loadFiles({ silent: hasLoadedOnceRef.current });
  }, [loadFiles, open]);

  React.useEffect(() => {
    if (!open || !hasLoadedOnceRef.current) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadFiles({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadFiles, open]);

  const totalStarredCount = React.useMemo(() => allFiles.filter((item) => item.isStarred).length, [allFiles]);
  const hasFilters = categoryFilter !== "" || readFilter !== "all";

  const filteredFiles = React.useMemo(() => {
    return allFiles.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) {
        return false;
      }

      if (readFilter === "read") {
        return item.isRead;
      }

      if (readFilter === "unread") {
        return !item.isRead;
      }

      return true;
    });
  }, [allFiles, categoryFilter, readFilter]);

  const starredFiles = React.useMemo(() => {
    return [...filteredFiles]
      .filter((item) => item.isStarred)
      .sort((left, right) => {
        const leftTime = left.starredAt ? new Date(left.starredAt).getTime() : 0;
        const rightTime = right.starredAt ? new Date(right.starredAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [filteredFiles]);

  const visibleFiles = activeTab === "starred" ? starredFiles : filteredFiles;
  const estimatedRowHeight = activeTab === "starred" ? 124 : 108;
  const rowVirtualizer = useVirtualizer({
    count: visibleFiles.length,
    getScrollElement: () => listContainerRef.current,
    getItemKey: (index) => visibleFiles[index]?.path ?? index,
    estimateSize: () => estimatedRowHeight,
    overscan: 8
  });

  React.useEffect(() => {
    listContainerRef.current?.scrollTo({ top: 0 });
  }, [activeTab, categoryFilter, readFilter]);

  React.useEffect(() => {
    if (!selectedPath.startsWith("pr/")) {
      return;
    }

    setAllFiles((prev) =>
      prev.map((item) =>
        item.path === selectedPath
          ? {
              ...item,
              isRead: true,
              readAt: new Date().toISOString()
            }
          : item
      )
    );
  }, [selectedPath]);

  React.useEffect(() => {
    if (!externalStarUpdate || !externalStarUpdate.path.startsWith("pr/")) {
      return;
    }

    setAllFiles((prev) =>
      prev.map((item) =>
        item.path === externalStarUpdate.path
          ? {
              ...item,
              isStarred: externalStarUpdate.isStarred,
              starredAt: externalStarUpdate.starredAt
            }
          : item
      )
    );
  }, [externalStarUpdate]);

  const handleToggleStar = React.useCallback(
    async (path: string, isStarred: boolean) => {
      setStarPendingPath(path);

      try {
        const response = await fetch("/api/docs/stars", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, isStarred: !isStarred })
        });
        const payload = (await response.json()) as { path?: string; isStarred?: boolean; starredAt?: string | null; error?: string };
        if (!response.ok || !payload.path || typeof payload.isStarred !== "boolean") {
          throw new Error(payload.error ?? "更新星标失败");
        }
        const nextIsStarred = payload.isStarred;
        const nextStarredAt = payload.starredAt ?? null;

        setAllFiles((prev) =>
          prev.map((item) =>
            item.path === payload.path
              ? {
                  ...item,
                  isStarred: nextIsStarred,
                  starredAt: nextStarredAt
                }
              : item
          )
        );
        onStarChanged?.(payload.path, nextIsStarred, nextStarredAt);
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "更新星标失败");
      } finally {
        setStarPendingPath("");
      }
    },
    [onStarChanged]
  );

  const handleRefresh = React.useCallback(() => {
    void loadFiles({ silent: hasLoadedOnceRef.current, forceSync: true });
  }, [loadFiles]);

  return (
    <>
      <Drawer
        variant={isLgUp ? "persistent" : "temporary"}
        anchor="right"
        open={open}
        onClose={() => onOpenChange(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: open ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            p: 1.25,
            borderLeft: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            top: APP_HEADER_HEIGHT,
            height: `calc(100dvh - ${APP_HEADER_HEIGHT}px)`,
            display: "flex",
            flexDirection: "column"
          }
        }}
      >
        <Box sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper", pb: 0.8 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={700}>
              PR 文件面板
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title={refreshing ? "正在刷新最新 PR 文件" : "刷新最新 PR 文件"}>
                <span>
                  <IconButton
                    size="small"
                    aria-label="刷新最新 PR 文件"
                    onClick={handleRefresh}
                    disabled={loading || refreshing}
                    sx={{ width: 40, height: 40 }}
                  >
                    {refreshing ? <CircularProgress size={18} color="inherit" /> : <RefreshRoundedIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
              <Button size="small" onClick={() => onOpenChange(false)}>
                收起
              </Button>
            </Stack>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Tabs
            value={activeTab}
            onChange={(_, value: ReviewDrawerTab) => {
              React.startTransition(() => {
                setActiveTab(value);
              });
            }}
            variant="fullWidth"
            sx={{ minHeight: 40, mb: 1 }}
          >
            <Tab
              value="all"
              label={`全部文件 ${allFiles.length.toLocaleString("zh-CN")}`}
              sx={{ minHeight: 40, textTransform: "none", fontWeight: 600 }}
            />
            <Tab
              value="starred"
              label={`星标文档 ${totalStarredCount.toLocaleString("zh-CN")}`}
              sx={{ minHeight: 40, textTransform: "none", fontWeight: 600 }}
            />
          </Tabs>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8}>
            <TextField
              select
              size="small"
              label="类别"
              value={categoryFilter}
              onChange={(event) => {
                React.startTransition(() => {
                  setCategoryFilter(event.target.value);
                });
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">全部</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category} value={category}>
                  {category}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="已读状态"
              value={readFilter}
              onChange={(event) => {
                React.startTransition(() => {
                  setReadFilter(event.target.value as PrFileReadFilter);
                });
              }}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="all">全部</MenuItem>
              <MenuItem value="read">已读</MenuItem>
              <MenuItem value="unread">未读</MenuItem>
            </TextField>
          </Stack>
        </Box>

        <Box ref={listContainerRef} sx={{ flex: 1, overflowY: "auto", pr: 0.35, minHeight: 0 }}>
          {refreshing ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
              正在后台刷新...
            </Typography>
          ) : null}
          {loading ? <LoadingState label="加载 PR 文件..." /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && visibleFiles.length === 0 ? (
            activeTab === "starred" ? (
              <EmptyState
                title={hasFilters ? "当前筛选下暂无星标文档" : "暂无星标文档"}
                description={hasFilters ? "请调整类别或已读筛选条件后重试" : "可先在“全部文件”标签中为重点 PR 文件加入星标"}
              />
            ) : (
              <EmptyState
                title={hasFilters ? "当前筛选下暂无 PR 文件" : "暂无 PR 文件"}
                description={hasFilters ? "请调整类别或已读筛选条件后重试" : "请检查 docs/pr 目录是否存在文件"}
              />
            )
          ) : null}

          {!loading && visibleFiles.length > 0 ? (
            <List
              disablePadding
              sx={{
                position: "relative",
                height: `${rowVirtualizer.getTotalSize()}px`
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = visibleFiles[virtualRow.index];
                return (
                  <Box
                    key={item.path}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    <PrFileListItem
                      item={item}
                      selectedPath={selectedPath}
                      showStarredAt={activeTab === "starred"}
                      isPending={starPendingPath === item.path}
                      onOpenFile={onOpenFile}
                      onToggleStar={(path, isStarred) => {
                        void handleToggleStar(path, isStarred);
                      }}
                    />
                  </Box>
                );
              })}
            </List>
          ) : null}
        </Box>
      </Drawer>

      {!open ? (
        <Box
          sx={{
            position: "fixed",
            right: 10,
            top: APP_HEADER_HEIGHT + 12,
            zIndex: 30
          }}
        >
          <Button variant="contained" onClick={() => onOpenChange(true)} endIcon={<LaunchIcon />}>
            打开 PR 面板
          </Button>
        </Box>
      ) : null}
    </>
  );
}
