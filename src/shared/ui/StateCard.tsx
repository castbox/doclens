"use client";

import { Alert, Box, CircularProgress, Typography } from "@mui/material";

export function LoadingState({ label = "加载中..." }: { label?: string }): React.JSX.Element {
  return (
    <Box display="flex" alignItems="center" justifyContent="center" minHeight={140} gap={1.5}>
      <CircularProgress size={22} />
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }): React.JSX.Element {
  return (
    <Box p={3} textAlign="center">
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" mt={0.75}>
          {description}
        </Typography>
      ) : null}
    </Box>
  );
}

export function ErrorState({ message }: { message: string }): React.JSX.Element {
  return <Alert severity="error">{message}</Alert>;
}
