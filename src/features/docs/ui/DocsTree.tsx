"use client";

import * as React from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { Alert, Box, IconButton, List, ListItemButton, ListItemIcon, ListItemText, TextField, Typography } from "@mui/material";
import type { TreeNode } from "@/features/docs/domain/types";

type NodeMap = Record<string, TreeNode[]>;

export function DocsTree({ selectedPath, onSelectFile }: { selectedPath: string; onSelectFile: (path: string) => void }): React.JSX.Element {
  const [nodeMap, setNodeMap] = React.useState<NodeMap>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [loadingAll, setLoadingAll] = React.useState(false);
  const [error, setError] = React.useState("");

  const fetchNodes = React.useCallback(async (path: string): Promise<TreeNode[]> => {
    const params = new URLSearchParams();
    if (path) {
      params.set("path", path);
    }

    const response = await fetch(`/api/docs/tree?${params.toString()}`);
    const payload = (await response.json()) as { error?: string; nodes?: TreeNode[] };
    if (!response.ok || !payload.nodes) {
      throw new Error(payload.error ?? "加载目录失败");
    }

    return payload.nodes;
  }, []);

  const loadAllNodes = React.useCallback(async () => {
    setLoadingAll(true);
    setError("");

    try {
      const nextNodeMap: NodeMap = {};
      const queue: string[] = [""];
      const expandedPaths = new Set<string>();

      while (queue.length > 0) {
        const currentPath = queue.shift() ?? "";
        const nodes = await fetchNodes(currentPath);
        nextNodeMap[currentPath] = nodes;
        expandedPaths.add(currentPath);

        for (const node of nodes) {
          if (node.type === "directory") {
            queue.push(node.path);
          }
        }
      }

      setNodeMap(nextNodeMap);
      setExpanded(expandedPaths);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载目录失败");
    } finally {
      setLoadingAll(false);
    }
  }, [fetchNodes]);

  React.useEffect(() => {
    void loadAllNodes();
  }, [loadAllNodes]);

  const toggleDirectory = React.useCallback(
    (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    },
    []
  );

  const renderNodes = React.useCallback(
    (nodes: TreeNode[], level: number): React.JSX.Element[] => {
      return nodes
        .filter((node) => node.name.toLowerCase().includes(filter.toLowerCase()))
        .map((node) => {
          const isDirectory = node.type === "directory";
          const isExpanded = expanded.has(node.path);
          const children = nodeMap[node.path] ?? [];

          return (
            <React.Fragment key={node.path}>
              <ListItemButton
                sx={{
                  position: "relative",
                  pl: 1.15 + level * 1.6,
                  pr: 0.75,
                  minHeight: { xs: 40, md: 35 },
                  borderRadius: 1.2,
                  cursor: "pointer",
                  mb: 0.35,
                  border: "1px solid",
                  borderColor: selectedPath === node.path ? "rgba(11,114,133,0.24)" : "transparent",
                  bgcolor: selectedPath === node.path ? "rgba(11,114,133,0.1)" : "transparent",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: 6,
                    bottom: 6,
                    width: 2.5,
                    borderRadius: 1,
                    backgroundColor: selectedPath === node.path ? "primary.main" : "transparent"
                  },
                  "&:hover": {
                    bgcolor: selectedPath === node.path ? "rgba(11,114,133,0.14)" : "action.hover"
                  }
                }}
                onClick={() => {
                  if (isDirectory) {
                    toggleDirectory(node.path);
                    return;
                  }

                  onSelectFile(node.path);
                }}
              >
                <ListItemIcon sx={{ minWidth: 28, color: isDirectory ? "text.secondary" : "text.primary" }}>
                  {isDirectory ? (
                    isExpanded ? <FolderOpenOutlinedIcon fontSize="small" color="primary" /> : <FolderOutlinedIcon fontSize="small" />
                  ) : (
                    <DescriptionOutlinedIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={node.name}
                  primaryTypographyProps={{
                    noWrap: true,
                    fontSize: { xs: 13.5, md: 13 },
                    fontWeight: selectedPath === node.path ? 600 : 500
                  }}
                />
                {isDirectory ? (
                  <IconButton
                    edge="end"
                    size="small"
                    aria-label={isExpanded ? "collapse" : "expand"}
                    sx={{
                      ml: 0.25
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleDirectory(node.path);
                    }}
                  >
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                ) : null}
              </ListItemButton>
              {isDirectory && isExpanded ? (
                <List key={`${node.path}:children`} disablePadding>
                  {renderNodes(children, level + 1)}
                </List>
              ) : null}
            </React.Fragment>
          );
        });
    },
    [expanded, filter, nodeMap, onSelectFile, selectedPath, toggleDirectory]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TextField
        placeholder="筛选目录/文件"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
        size="small"
        inputProps={{ "aria-label": "filter docs tree" }}
        sx={{ mb: 1 }}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {loadingAll ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          正在同步目录索引...
        </Typography>
      ) : null}

      <List disablePadding sx={{ pr: 0.25, overflowY: "auto", minHeight: 0, maxHeight: "calc(100dvh - 178px)" }}>
        {renderNodes(nodeMap[""] ?? [], 0)}
      </List>
    </Box>
  );
}
