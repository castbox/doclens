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
  Typography
} from "@mui/material";
import type { PrFileRecord } from "@/features/reviews/domain/types";
import { formatDateTime } from "@/shared/domain/time";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";

type PrFilesPayload = {
  files?: PrFileRecord[];
  dates?: string[];
  error?: string;
};

export function ReviewDrawer({
  selectedPath,
  onOpenFile,
  refreshToken
}: {
  selectedPath: string;
  onOpenFile: (path: string) => void;
  refreshToken: number;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  const [files, setFiles] = React.useState<PrFileRecord[]>([]);
  const [dates, setDates] = React.useState<string[]>([]);
  const [dateFilter, setDateFilter] = React.useState("");
  const [keywordInput, setKeywordInput] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(keywordInput.trim());
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [keywordInput]);

  const loadFiles = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (dateFilter) {
        params.set("date", dateFilter);
      }
      if (keyword) {
        params.set("q", keyword);
      }

      const response = await fetch(`/api/reviews/pr-files?${params.toString()}`);
      const payload = (await response.json()) as PrFilesPayload;
      if (!response.ok || !payload.files || !payload.dates) {
        throw new Error(payload.error ?? "加载 PR 文件失败");
      }

      setFiles(payload.files);
      setDates(payload.dates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载 PR 文件失败");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, keyword]);

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
        variant="persistent"
        anchor="right"
        open={open}
        sx={{
          width: open ? 360 : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: 360,
            boxSizing: "border-box",
            p: 1.25,
            borderLeft: "1px solid #D7E4EE"
          }
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={700}>
            PR 文件面板
          </Typography>
          <Button size="small" onClick={() => setOpen(false)}>
            收起
          </Button>
        </Stack>

        <Divider sx={{ my: 1 }} />

        <Stack direction={{ xs: "column", md: "row" }} spacing={0.8} sx={{ mb: 1 }}>
          <TextField
            select
            size="small"
            label="日期目录"
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value);
            }}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="">全部</MenuItem>
            {dates.map((date) => (
              <MenuItem key={date} value={date}>
                {date}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="关键词"
            placeholder="按路径/文件名搜索"
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value);
            }}
            fullWidth
          />
        </Stack>

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
                  mb: 0.8,
                  borderRadius: 1.2,
                  border: "1px solid",
                  borderColor: selectedPath === item.path ? "primary.main" : "divider"
                }}
              >
                <ListItemText
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
                          日期目录：{item.dateFolder}
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
      </Drawer>

      {!open ? (
        <Box
          sx={{
            position: "fixed",
            right: 8,
            top: 88,
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
