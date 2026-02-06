"use client";

import * as React from "react";
import LaunchIcon from "@mui/icons-material/Launch";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { PrFileReadFilter, PrFileRecord } from "@/features/reviews/domain/types";
import { formatDateTime } from "@/shared/domain/time";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";

type PrFilesPayload = {
  files?: PrFileRecord[];
  categories?: string[];
  error?: string;
};
const DRAWER_WIDTH = 360;
const APP_HEADER_HEIGHT = 64;

export function ReviewDrawer({
  selectedPath,
  onOpenFile,
  refreshToken
}: {
  selectedPath: string;
  onOpenFile: (path: string) => void;
  refreshToken: number;
}): React.JSX.Element {
  const theme = useTheme();
  const isLgUp = useMediaQuery(theme.breakpoints.up("lg"));
  const [open, setOpen] = React.useState(false);
  const [files, setFiles] = React.useState<PrFileRecord[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = React.useState("");
  const [readFilter, setReadFilter] = React.useState<PrFileReadFilter>("all");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (isLgUp) {
      setOpen(true);
    }
  }, [isLgUp]);

  const loadFiles = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (categoryFilter) {
        params.set("category", categoryFilter);
      }
      params.set("read", readFilter);

      const response = await fetch(`/api/reviews/pr-files?${params.toString()}`);
      const payload = (await response.json()) as PrFilesPayload;
      if (!response.ok || !payload.files || !payload.categories) {
        throw new Error(payload.error ?? "加载 PR 文件失败");
      }

      setFiles(payload.files);
      setCategories(payload.categories);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载 PR 文件失败");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, readFilter]);

  React.useEffect(() => {
    void loadFiles();
  }, [loadFiles, refreshToken]);

  React.useEffect(() => {
    if (!selectedPath.startsWith("pr/")) {
      return;
    }

    setFiles((prev) =>
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

  return (
    <>
      <Drawer
        variant={isLgUp ? "persistent" : "temporary"}
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
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
            <Button size="small" onClick={() => setOpen(false)}>
              收起
            </Button>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8}>
            <TextField
              select
              size="small"
              label="类别"
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
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
                setReadFilter(event.target.value as PrFileReadFilter);
              }}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="all">全部</MenuItem>
              <MenuItem value="read">已读</MenuItem>
              <MenuItem value="unread">未读</MenuItem>
            </TextField>
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflowY: "auto", pr: 0.35, minHeight: 0 }}>
          {loading ? <LoadingState label="加载 PR 文件..." /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && files.length === 0 ? <EmptyState title="暂无 PR 文件" description="请检查 docs/pr 目录是否存在文件" /> : null}

          {!loading && files.length > 0 ? (
            <List disablePadding>
              {files.map((item) => (
                <ListItemButton
                  key={item.path}
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
                    }
                  }}
                >
                  <ListItemText
                    sx={{ pl: 1.25 }}
                    primary={
                      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {item.name}
                        </Typography>
                        <Chip label={item.isRead ? "已读" : "未读"} size="small" color={item.isRead ? "success" : "warning"} variant="outlined" />
                      </Stack>
                    }
                    secondary={
                      <>
                        <Typography variant="caption" color="text.secondary" className="mono">
                          {item.path}
                        </Typography>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mt={0.75}>
                          <Typography variant="caption" color="text.secondary">
                            类别：{item.category}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            创建：{formatDateTime(item.createdAt)}
                          </Typography>
                        </Stack>
                      </>
                    }
                  />
                </ListItemButton>
              ))}
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
          <Button variant="contained" onClick={() => setOpen(true)} endIcon={<LaunchIcon />}>
            打开 PR 面板
          </Button>
        </Box>
      ) : null}
    </>
  );
}
