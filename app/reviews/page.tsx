"use client";

import * as React from "react";
import { Alert, Box, Button, Container, Stack, TextField, Typography } from "@mui/material";
import Link from "next/link";
import type { ReviewSheet } from "@/features/reviews/domain/types";
import { ReviewListTable } from "@/features/reviews/ui/ReviewListTable";
import { LoadingState } from "@/shared/ui/StateCard";

export default function ReviewListPage(): React.JSX.Element {
  const [rows, setRows] = React.useState<ReviewSheet[]>([]);
  const [status, setStatus] = React.useState("");
  const [docPath, setDocPath] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (status) {
        params.set("status", status);
      }

      if (docPath) {
        params.set("doc_path", docPath);
      }

      const response = await fetch(`/api/reviews?${params.toString()}`);
      const payload = (await response.json()) as { reviews?: ReviewSheet[]; error?: string };
      if (!response.ok || !payload.reviews) {
        throw new Error(payload.error ?? "加载失败");
      }

      setRows(payload.reviews);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [docPath, status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="h5" fontWeight={800}>
              审阅单列表
            </Typography>
            <Typography variant="body2" color="text.secondary">
              检索历史审阅记录并回到关联文档
            </Typography>
          </Box>

          <Button variant="outlined" component={Link} href="/docs">
            返回 /docs
          </Button>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} gap={1}>
          <TextField
            label="状态过滤"
            placeholder="如 Approved"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
            }}
            sx={{ minWidth: 180 }}
          />
          <TextField
            fullWidth
            label="文档路径过滤"
            placeholder="docs/prd/doclens_prd.md"
            value={docPath}
            onChange={(event) => {
              setDocPath(event.target.value);
            }}
          />
          <Button variant="contained" onClick={() => void load()} sx={{ minWidth: 110 }}>
            筛选
          </Button>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {loading ? <LoadingState label="加载审阅列表..." /> : <ReviewListTable rows={rows} />}
      </Stack>
    </Container>
  );
}
