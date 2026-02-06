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
type LoadingPathSet = Set<string>;

export function DocsTree({ selectedPath, onSelectFile }: { selectedPath: string; onSelectFile: (path: string) => void }): React.JSX.Element {
  const [nodeMap, setNodeMap] = React.useState<NodeMap>({});
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set([""]));
  const [filter, setFilter] = React.useState("");
  const [loadingPaths, setLoadingPaths] = React.useState<LoadingPathSet>(new Set());
  const [loadingRoot, setLoadingRoot] = React.useState(false);
  const [error, setError] = React.useState("");
  const nodeMapRef = React.useRef<NodeMap>({});
  const inflightRef = React.useRef<Map<string, Promise<TreeNode[]>>>(new Map());

  React.useEffect(() => {
    nodeMapRef.current = nodeMap;
  }, [nodeMap]);

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

  const ensureNodesLoaded = React.useCallback(async (path: string): Promise<TreeNode[]> => {
    const cached = nodeMapRef.current[path];
    if (cached) {
      return cached;
    }

    const inflight = inflightRef.current.get(path);
    if (inflight) {
      return inflight;
    }

    setLoadingPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });

    const request = fetchNodes(path)
      .then((nodes) => {
        setNodeMap((prev) => {
          if (prev[path]) {
            return prev;
          }
          return {
            ...prev,
            [path]: nodes
          };
        });
        return nodes;
      })
      .finally(() => {
        inflightRef.current.delete(path);
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      });

    inflightRef.current.set(path, request);
    return request;
  }, [fetchNodes]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingRoot(true);
    setError("");

    void ensureNodesLoaded("")
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "加载目录失败");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRoot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ensureNodesLoaded]);

  React.useEffect(() => {
    if (!selectedPath) {
      return;
    }

    const parts = selectedPath.split("/").filter(Boolean);
    if (parts.length < 2) {
      return;
    }

    let cancelled = false;

    const expandPathChain = async () => {
      const ancestors: string[] = [];
      for (let index = 0; index < parts.length - 1; index += 1) {
        const ancestor = parts.slice(0, index + 1).join("/");
        ancestors.push(ancestor);
        await ensureNodesLoaded(ancestor);
      }

      if (cancelled) {
        return;
      }

      setExpanded((prev) => {
        const next = new Set(prev);
        next.add("");
        for (const ancestor of ancestors) {
          next.add(ancestor);
        }
        return next;
      });
    };

    void expandPathChain().catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : "加载目录失败");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ensureNodesLoaded, selectedPath]);

  const toggleDirectory = React.useCallback(
    (path: string, shouldExpand: boolean) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (shouldExpand) {
          next.add(path);
        } else {
          next.delete(path);
        }
        return next;
      });

      if (!shouldExpand) {
        return;
      }

      setError("");
      void ensureNodesLoaded(path).catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "加载目录失败");
      });
    },
    [ensureNodesLoaded]
  );

  const renderNodes = React.useCallback(
    (nodes: TreeNode[], level: number): React.JSX.Element[] => {
      return nodes
        .filter((node) => node.name.toLowerCase().includes(filter.toLowerCase()))
        .map((node) => {
          const isDirectory = node.type === "directory";
          const isExpanded = expanded.has(node.path);
          const children = nodeMap[node.path] ?? [];
          const isLoadingChildren = loadingPaths.has(node.path);
          const canExpand = isDirectory && (node.hasChildren ?? true);
          const hasLoadedChildren = children.length > 0;

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
                    if (!canExpand) {
                      return;
                    }

                    toggleDirectory(node.path, !isExpanded);
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
                    disabled={!canExpand}
                    sx={{
                      ml: 0.25
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!canExpand) {
                        return;
                      }

                      toggleDirectory(node.path, !isExpanded);
                    }}
                  >
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                ) : null}
              </ListItemButton>
              {isDirectory && isExpanded && isLoadingChildren ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: "block",
                    pl: 1.15 + (level + 1) * 1.6,
                    mb: 0.35
                  }}
                >
                  正在加载子目录...
                </Typography>
              ) : null}
              {isDirectory && isExpanded && hasLoadedChildren ? (
                <List key={`${node.path}:children`} disablePadding>
                  {renderNodes(children, level + 1)}
                </List>
              ) : null}
            </React.Fragment>
          );
        });
    },
    [expanded, filter, loadingPaths, nodeMap, onSelectFile, selectedPath, toggleDirectory]
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
      {loadingRoot ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          正在加载目录...
        </Typography>
      ) : null}

      <List disablePadding sx={{ pr: 0.25, overflowY: "auto", minHeight: 0, maxHeight: "calc(100dvh - 178px)" }}>
        {renderNodes(nodeMap[""] ?? [], 0)}
      </List>
    </Box>
  );
}
