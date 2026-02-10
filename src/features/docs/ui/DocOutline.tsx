"use client";

import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Collapse, IconButton, List, ListItemButton, ListItemText, Stack, Tooltip, Typography } from "@mui/material";
import * as React from "react";
import type { MarkdownHeading } from "@/features/docs/domain/markdownHeading";

export function DocOutline({ headings }: { headings: MarkdownHeading[] }): React.JSX.Element | null {
  const [collapsed, setCollapsed] = React.useState(false);

  if (headings.length === 0) {
    return null;
  }

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 0.8, py: 0.8 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 0.2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 600 }}>
          文档大纲
        </Typography>
        <Tooltip title={collapsed ? "展开大纲" : "收起大纲"}>
          <IconButton
            size="small"
            aria-label={collapsed ? "展开文档大纲" : "收起文档大纲"}
            onClick={() => {
              setCollapsed((prev) => !prev);
            }}
          >
            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={!collapsed} timeout="auto" unmountOnExit>
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
      </Collapse>
    </Box>
  );
}
