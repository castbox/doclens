"use client";

import * as React from "react";
import { Box, Chip, Divider, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import type { ReviewItem, ReviewItemState } from "@/features/reviews/domain/types";

const STATES: ReviewItemState[] = ["Open", "Resolved", "Won't Fix"];

export function ReviewItemsEditor({
  sheetId,
  items,
  onUpdated
}: {
  sheetId: string;
  items: ReviewItem[];
  onUpdated: (item: ReviewItem) => void;
}): React.JSX.Element {
  if (items.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Typography color="text.secondary">暂无问题项（创建功能已下线）。</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1.25}>
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
  );
}
