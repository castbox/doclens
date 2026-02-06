"use client";

import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import type { MarkdownHeading } from "@/features/docs/domain/markdownHeading";

export function DocOutline({ headings }: { headings: MarkdownHeading[] }): React.JSX.Element | null {
  if (headings.length === 0) {
    return null;
  }

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 0.8, py: 0.8 }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.2, display: "block", fontWeight: 600 }}>
        文档大纲
      </Typography>
      <List dense disablePadding>
        {headings.map((heading, index) => (
          <ListItemButton
            key={`${heading.slug}-${heading.level}-${index}`}
            onClick={() => {
              const target = document.getElementById(heading.slug);
              if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            sx={{
              pl: Math.max(1, heading.level - 1) * 1.4,
              borderRadius: 1,
              minHeight: 32,
              mb: 0.3,
              "&:hover": {
                bgcolor: "action.hover"
              }
            }}
          >
            <ListItemText
              primary={heading.text}
              primaryTypographyProps={{
                variant: "caption",
                noWrap: false,
                fontSize: 12.5,
                lineHeight: 1.45,
                sx: {
                  overflowWrap: "anywhere",
                  wordBreak: "break-word"
                }
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
