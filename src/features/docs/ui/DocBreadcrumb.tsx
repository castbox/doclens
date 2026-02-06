"use client";

import { Breadcrumbs, Link, Typography } from "@mui/material";

export function DocBreadcrumb({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }): React.JSX.Element {
  const parts = path.split("/").filter(Boolean);

  return (
    <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
      <Link
        component="button"
        underline="hover"
        color="inherit"
        onClick={() => {
          onNavigate("");
        }}
      >
        docs
      </Link>
      {parts.map((part, index) => {
        const partialPath = parts.slice(0, index + 1).join("/");
        const isLast = index === parts.length - 1;

        return isLast ? (
          <Typography key={partialPath} color="text.primary" fontWeight={600}>
            {part}
          </Typography>
        ) : (
          <Link
            key={partialPath}
            component="button"
            underline="hover"
            color="inherit"
            onClick={() => {
              onNavigate(partialPath);
            }}
          >
            {part}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
}
