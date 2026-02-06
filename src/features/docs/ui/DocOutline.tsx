"use client";

import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import type { MarkdownHeading } from "@/features/docs/domain/markdownHeading";

export function DocOutline({ headings }: { headings: MarkdownHeading[] }): React.JSX.Element | null {

  if (headings.length === 0) {
    return null;
  }

  return (
    <Box sx={{ borderLeft: "1px solid", borderColor: "divider", px: 1, py: 1, maxHeight: 320, overflowY: "auto" }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
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
            sx={{ pl: Math.max(1, heading.level - 1) * 1.6 }}
          >
            <ListItemText
              primary={heading.text}
              primaryTypographyProps={{
                variant: "caption",
                noWrap: true
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
