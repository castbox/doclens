"use client";

import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";

type Heading = {
  level: number;
  text: string;
  slug: string;
};

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function extractHeadings(markdown: string): Heading[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) {
        return null;
      }

      const level = match[1].length;
      const text = match[2].trim();
      return {
        level,
        text,
        slug: toSlug(text)
      };
    })
    .filter((item): item is Heading => item !== null)
    .slice(0, 40);
}

export function DocOutline({ markdown }: { markdown: string }): React.JSX.Element | null {
  const headings = extractHeadings(markdown);

  if (headings.length === 0) {
    return null;
  }

  return (
    <Box sx={{ borderLeft: "1px solid", borderColor: "divider", px: 1, py: 1, maxHeight: 320, overflowY: "auto" }}>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        文档大纲
      </Typography>
      <List dense disablePadding>
        {headings.map((heading) => (
          <ListItemButton
            key={`${heading.slug}-${heading.level}`}
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
