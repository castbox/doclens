"use client";

import * as React from "react";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { Alert, Box, IconButton, List, ListItemButton, ListItemIcon, ListItemText, TextField, Typography } from "@mui/material";
import type { TreeNode } from "@/features/docs/domain/types";

const STORAGE_KEY = "doclens:expanded_tree_paths";

type NodeMap = Record<string, TreeNode[]>;

export function DocsTree({ selectedPath, onSelectFile }: { selectedPath: string; onSelectFile: (path: string) => void }): React.JSX.Element {
  const [nodeMap, setNodeMap] = React.useState<NodeMap>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set([""]));
  const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [error, setError] = React.useState("");

  const loadNodes = React.useCallback(async (path: string) => {
    setLoadingPaths((prev) => new Set(prev).add(path));
    setError("");

    try {
      const params = new URLSearchParams();
      if (path) {
        params.set("path", path);
      }

      const response = await fetch(`/api/docs/tree?${params.toString()}`);
      const payload = (await response.json()) as { error?: string; nodes?: TreeNode[] };

      if (!response.ok || !payload.nodes) {
        throw new Error(payload.error ?? "加载目录失败");
      }

      setNodeMap((prev) => ({ ...prev, [path]: payload.nodes ?? [] }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载目录失败");
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, []);

  React.useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as string[];
        setExpanded(new Set(["", ...parsed]));
      } catch {
        // ignore invalid cache
      }
    }

    loadNodes("");
  }, [loadNodes]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = Array.from(expanded).filter((item) => item);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [expanded]);

  const toggleDirectory = React.useCallback(
    async (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });

      if (!nodeMap[path]) {
        await loadNodes(path);
      }
    },
    [loadNodes, nodeMap]
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
                  pl: 1 + level * 1.75,
                  pr: 1,
                  minHeight: 38,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: selectedPath === node.path ? "rgba(11,114,133,0.12)" : "transparent"
                }}
                onClick={() => {
                  if (isDirectory) {
                    void toggleDirectory(node.path);
                    return;
                  }

                  onSelectFile(node.path);
                }}
              >
                <ListItemIcon sx={{ minWidth: 30 }}>
                  {isDirectory ? (
                    isExpanded ? <FolderOpenOutlinedIcon fontSize="small" color="primary" /> : <FolderOutlinedIcon fontSize="small" />
                  ) : (
                    <DescriptionOutlinedIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemText primary={node.name} primaryTypographyProps={{ noWrap: true, fontSize: 13.5 }} />
                {isDirectory ? (
                  <IconButton
                    edge="end"
                    size="small"
                    aria-label={isExpanded ? "collapse" : "expand"}
                    sx={{
                      ml: 0.5
                    }}
                  >
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                ) : null}
              </ListItemButton>
              {isDirectory && isExpanded ? (
                loadingPaths.has(node.path) ? (
                  <Typography key={`${node.path}:loading`} variant="caption" color="text.secondary" sx={{ pl: 2 + level * 1.75, py: 0.5, display: "block" }}>
                    加载中...
                  </Typography>
                ) : (
                  <List key={`${node.path}:children`} disablePadding>
                    {renderNodes(children, level + 1)}
                  </List>
                )
              ) : null}
            </React.Fragment>
          );
        });
    },
    [expanded, filter, loadingPaths, nodeMap, onSelectFile, selectedPath, toggleDirectory]
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TextField
        placeholder="过滤目录节点"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
        size="small"
        inputProps={{ "aria-label": "filter docs tree" }}
        sx={{ mb: 1 }}
      />

      {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}

      <Box sx={{ overflowY: "auto", flex: 1, pr: 0.5 }}>
        <List disablePadding>{renderNodes(nodeMap[""] ?? [], 0)}</List>
      </Box>
    </Box>
  );
}
