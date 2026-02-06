"use client";

import * as React from "react";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import LaunchIcon from "@mui/icons-material/Launch";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import Link from "next/link";
import { buildDefaultReviewSheet } from "@/features/reviews/domain/reviewTemplate";
import type { CreateReviewSheetInput, ReviewSheet } from "@/features/reviews/domain/types";
import { ReviewSheetForm } from "@/features/reviews/ui/ReviewSheetForm";
import { formatDateTime } from "@/shared/domain/time";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";

export function ReviewDrawer({ docPath }: { docPath: string }): React.JSX.Element {
  const [open, setOpen] = React.useState(true);
  const [reviews, setReviews] = React.useState<ReviewSheet[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const loadReviews = React.useCallback(async () => {
    if (!docPath) {
      setReviews([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/reviews?doc_path=${encodeURIComponent(docPath)}`);
      const payload = (await response.json()) as { reviews?: ReviewSheet[]; error?: string };
      if (!response.ok || !payload.reviews) {
        throw new Error(payload.error ?? "加载审阅单失败");
      }

      setReviews(payload.reviews);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载审阅单失败");
    } finally {
      setLoading(false);
    }
  }, [docPath]);

  React.useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

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
            审阅面板
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="创建审阅单">
              <IconButton
                size="small"
                aria-label="create review sheet"
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                <AddCircleOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button size="small" onClick={() => setOpen(false)}>
              收起
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {!docPath ? <EmptyState title="选择文档后可查看关联审阅单" /> : null}
        {loading ? <LoadingState label="加载审阅单..." /> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && docPath && reviews.length === 0 ? <EmptyState title="暂无关联审阅单" description="点击右上角 + 创建首条记录" /> : null}

        {!loading && reviews.length > 0 ? (
          <List disablePadding>
            {reviews.map((item) => (
              <ListItemButton key={item.id} component={Link} href={`/reviews/${item.id}`} sx={{ mb: 0.8, borderRadius: 1.2, border: "1px solid", borderColor: "divider" }}>
                <ListItemText
                  primary={
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {item.title}
                      </Typography>
                      <Chip label={item.status} size="small" variant="outlined" />
                    </Stack>
                  }
                  secondary={
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mt={0.75}>
                      <Typography variant="caption" color="text.secondary">
                        {item.reviewer || "未指定 Reviewer"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(item.updatedAt)}
                      </Typography>
                    </Stack>
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
            打开审阅面板
          </Button>
        </Box>
      ) : null}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>创建审阅单</DialogTitle>
        <DialogContent>
          <ReviewSheetForm
            initialValue={buildDefaultReviewSheet(docPath)}
            loading={creating}
            onSubmit={async (value: CreateReviewSheetInput) => {
              setCreating(true);
              setError("");

              try {
                const response = await fetch("/api/reviews", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(value)
                });

                const payload = (await response.json()) as ReviewSheet & { error?: string };
                if (!response.ok) {
                  throw new Error(payload.error ?? "创建失败");
                }

                setCreateOpen(false);
                await loadReviews();
              } catch (createError) {
                setError(createError instanceof Error ? createError.message : "创建失败");
              } finally {
                setCreating(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
