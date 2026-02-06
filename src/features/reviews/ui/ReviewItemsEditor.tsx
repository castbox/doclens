"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Divider, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import type { CreateReviewItemInput, ReviewItem, ReviewItemState, ReviewSeverity } from "@/features/reviews/domain/types";

const SEVERITIES: ReviewSeverity[] = ["P0", "P1", "P2"];
const STATES: ReviewItemState[] = ["Open", "Resolved", "Won't Fix"];

const EMPTY_FORM: CreateReviewItemInput = {
  severity: "P1",
  description: "",
  suggestion: "",
  assignee: "",
  dueDate: null,
  state: "Open"
};

export function ReviewItemsEditor({
  sheetId,
  items,
  onCreated,
  onUpdated
}: {
  sheetId: string;
  items: ReviewItem[];
  onCreated: (item: ReviewItem) => void;
  onUpdated: (item: ReviewItem) => void;
}): React.JSX.Element {
  const [form, setForm] = React.useState<CreateReviewItemInput>(EMPTY_FORM);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  return (
    <Stack spacing={1.25}>
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
          新增问题项
        </Typography>

        <Stack
          component="form"
          spacing={1}
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setError("");

            try {
              const response = await fetch(`/api/reviews/${sheetId}/items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
              });

              const payload = (await response.json()) as ReviewItem & { error?: string };
              if (!response.ok) {
                throw new Error(payload.error ?? "创建失败");
              }

              onCreated(payload);
              setForm(EMPTY_FORM);
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : "创建失败");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              select
              label="严重级别"
              value={form.severity}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, severity: event.target.value as ReviewSeverity }));
              }}
              sx={{ minWidth: 130 }}
            >
              {SEVERITIES.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="责任人"
              value={form.assignee}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, assignee: event.target.value }));
              }}
              required
              sx={{ minWidth: 160 }}
            />

            <TextField
              type="date"
              label="截止日期"
              InputLabelProps={{ shrink: true }}
              value={form.dueDate ?? ""}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, dueDate: event.target.value || null }));
              }}
              sx={{ minWidth: 170 }}
            />
          </Stack>

          <TextField
            label="问题描述"
            value={form.description}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, description: event.target.value }));
            }}
            required
            multiline
            minRows={2}
          />

          <TextField
            label="建议方案"
            value={form.suggestion}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, suggestion: event.target.value }));
            }}
            required
            multiline
            minRows={2}
          />

          <Button type="submit" variant="contained" disabled={loading}>
            添加问题项
          </Button>
        </Stack>

        {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
      </Paper>

      <Stack spacing={1}>
        {items.map((item) => (
          <Paper key={item.id} variant="outlined" sx={{ p: 1.1 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
              <Stack direction="row" spacing={0.8}>
                <Chip label={item.severity} size="small" color={item.severity === "P0" ? "error" : item.severity === "P1" ? "warning" : "default"} />
                <Chip label={item.state} size="small" variant="outlined" />
                <Chip label={item.assignee} size="small" variant="outlined" />
              </Stack>

              <TextField
                select
                value={item.state}
                size="small"
                onChange={async (event) => {
                  const nextState = event.target.value as ReviewItemState;
                  const response = await fetch(`/api/reviews/${sheetId}/items/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ state: nextState })
                  });

                  const payload = (await response.json()) as ReviewItem & { error?: string };
                  if (response.ok) {
                    onUpdated(payload);
                  }
                }}
                sx={{ minWidth: 140 }}
              >
                {STATES.map((state) => (
                  <MenuItem key={state} value={state}>
                    {state}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              问题
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.description}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                建议
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {item.suggestion}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
