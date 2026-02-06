"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Container, Divider, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReviewSheetWithItems, ReviewStatus } from "@/features/reviews/domain/types";
import { ReviewItemsEditor } from "@/features/reviews/ui/ReviewItemsEditor";
import { LoadingState } from "@/shared/ui/StateCard";

const STATUSES: ReviewStatus[] = ["Draft", "In Review", "Changes Requested", "Approved", "Done"];

export default function ReviewDetailPage({ params }: { params: { id: string } }): React.JSX.Element {
  const router = useRouter();
  const [data, setData] = React.useState<ReviewSheetWithItems | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/reviews/${params.id}`);
      const payload = (await response.json()) as ReviewSheetWithItems & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "加载失败");
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="h5" fontWeight={800}>
            审阅单详情
          </Typography>

          <Stack direction="row" gap={1}>
            <Button variant="outlined" component={Link} href="/reviews">
              返回列表
            </Button>
            {data ? (
              <Button variant="outlined" component={Link} href={`/docs?path=${encodeURIComponent(data.docPath)}`}>
                打开关联文档
              </Button>
            ) : null}
          </Stack>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {loading ? <LoadingState label="加载详情..." /> : null}

        {!loading && data ? (
          <Stack spacing={1.25}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1}>
                <Box>
                  <Typography variant="h6" fontWeight={700}>
                    {data.title}
                  </Typography>
                  <Typography variant="caption" className="mono" color="text.secondary">
                    {data.docPath}
                  </Typography>
                </Box>

                <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                  <Chip label={data.conclusion} variant="outlined" />
                  <TextField
                    select
                    size="small"
                    label="状态"
                    value={data.status}
                    onChange={async (event) => {
                      const status = event.target.value as ReviewStatus;
                      const response = await fetch(`/api/reviews/${params.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status })
                      });

                      const payload = (await response.json()) as ReviewSheetWithItems & { error?: string };
                      if (response.ok) {
                        setData((prev) =>
                          prev
                            ? {
                                ...prev,
                                status: payload.status,
                                updatedAt: payload.updatedAt
                              }
                            : prev
                        );
                      }
                    }}
                    sx={{ minWidth: 180 }}
                  >
                    {STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Stack>

              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.6 }}>
                一句话结论
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.summary}
              </Typography>
            </Paper>

            <ReviewItemsEditor
              sheetId={params.id}
              items={data.items}
              onUpdated={(item) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        items: prev.items.map((existing) => (existing.id === item.id ? item : existing))
                      }
                    : prev
                );
              }}
            />
          </Stack>
        ) : null}

        {!loading && !data && !error ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography color="text.secondary">审阅单不存在。</Typography>
            <Button sx={{ mt: 1 }} variant="outlined" onClick={() => router.push("/reviews")}>
              返回列表
            </Button>
          </Paper>
        ) : null}
      </Stack>
    </Container>
  );
}
