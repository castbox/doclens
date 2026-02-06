"use client";

import * as React from "react";
import { Box, Button, MenuItem, Stack, TextField } from "@mui/material";
import type { CreateReviewSheetInput, ReviewConclusion, ReviewDocType, ReviewStatus } from "@/features/reviews/domain/types";

const DOC_TYPES: ReviewDocType[] = ["PRD", "Design", "PR", "Log", "Other"];
const CONCLUSIONS: ReviewConclusion[] = ["Approved", "Changes Requested", "Reject", "Need Discussion"];
const STATUSES: ReviewStatus[] = ["Draft", "In Review", "Changes Requested", "Approved", "Done"];

export function ReviewSheetForm({
  initialValue,
  loading,
  onSubmit
}: {
  initialValue: CreateReviewSheetInput;
  loading?: boolean;
  onSubmit: (value: CreateReviewSheetInput) => Promise<void>;
}): React.JSX.Element {
  const [form, setForm] = React.useState<CreateReviewSheetInput>(initialValue);

  React.useEffect(() => {
    setForm(initialValue);
  }, [initialValue]);

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(form);
      }}
    >
      <Stack spacing={1.1}>
        <TextField
          label="标题"
          value={form.title}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, title: event.target.value }));
          }}
          required
        />

        <TextField label="关联文档" value={form.docPath} disabled />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
          <TextField
            select
            label="文档类型"
            value={form.docType}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, docType: event.target.value as ReviewDocType }));
            }}
            fullWidth
          >
            {DOC_TYPES.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="结论"
            value={form.conclusion}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, conclusion: event.target.value as ReviewConclusion }));
            }}
            fullWidth
          >
            {CONCLUSIONS.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
          <TextField
            label="Owner"
            value={form.owner}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, owner: event.target.value }));
            }}
            fullWidth
            required
          />

          <TextField
            label="Reviewer"
            value={form.reviewer}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, reviewer: event.target.value }));
            }}
            fullWidth
            required
          />
        </Stack>

        <TextField
          select
          label="状态"
          value={form.status ?? "Draft"}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, status: event.target.value as ReviewStatus }));
          }}
        >
          {STATUSES.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="一句话结论"
          value={form.summary}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, summary: event.target.value }));
          }}
          required
          multiline
          minRows={2}
        />

        <Button type="submit" variant="contained" disabled={loading}>
          创建审阅单
        </Button>
      </Stack>
    </Box>
  );
}
