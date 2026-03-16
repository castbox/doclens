"use client";

import * as React from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import dynamic from "next/dynamic";
import type { DocStarStatus, DocStarUpdate, FilePreviewPayload } from "@/features/docs/domain/types";
import { DocBreadcrumb } from "@/features/docs/ui/DocBreadcrumb";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";
import type { DocExportFormat } from "@/features/docs/domain/docExport";

type PreviewLocation = {
  line?: number;
  heading?: string;
};

function languageFromFilePath(filePath: string): string {
  const extension = filePath.includes(".") ? filePath.slice(filePath.lastIndexOf(".") + 1) : "txt";
  return extension.toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function getDownloadFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
  if (plainMatch?.[1]) {
    return decodeURIComponent(plainMatch[1]);
  }

  return fallback;
}

const ORANGE_CODE_COLOR = "#E96900";

const DocMarkdownPreviewBody = dynamic(
  () => import("@/features/docs/ui/DocMarkdownPreviewBody").then((module) => module.DocMarkdownPreviewBody),
  {
    ssr: false,
    loading: () => (
      <Paper
        variant="outlined"
        sx={{
          minHeight: 220,
          display: "grid",
          placeItems: "center",
          p: 2
        }}
      >
        <CircularProgress size={26} />
      </Paper>
    )
  }
);

function CodeTextPreview({ content, filePath, location }: { content: string; filePath: string; location?: PreviewLocation }): React.JSX.Element {
  const lines = content.split(/\r?\n/);

  React.useEffect(() => {
    if (!location?.line) {
      return;
    }

    const target = document.getElementById(`line-${location.line}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [location?.line, filePath]);

  return (
    <Paper variant="outlined" sx={{ overflow: "auto", borderRadius: 1.5 }}>
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(238,243,248,0.85)" }}>
        <Typography variant="caption" className="mono" color="text.secondary">
          language: {languageFromFilePath(filePath)}
        </Typography>
      </Box>
      <Box component="pre" sx={{ m: 0, p: 0, fontSize: 13, lineHeight: 1.62, minHeight: 200, whiteSpace: "pre", bgcolor: "#F8F8F8" }}>
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const highlighted = location?.line === lineNumber;

          return (
            <Box
              key={lineNumber}
              id={`line-${lineNumber}`}
              sx={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "58px 1fr",
                px: 1.2,
                bgcolor: highlighted ? "#EFEFEF" : "#F8F8F8",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 2.5,
                  backgroundColor: highlighted ? "secondary.main" : "transparent"
                }
              }}
            >
              <Typography
                component="span"
                variant="caption"
                className="mono"
                color="text.secondary"
                sx={{ userSelect: "none", py: 0.3 }}
              >
                {lineNumber}
              </Typography>
              <Typography component="span" variant="caption" className="mono" sx={{ py: 0.3, color: ORANGE_CODE_COLOR }}>
                {line || " "}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

function buildFallbackStarState(path: string): DocStarStatus {
  return {
    path,
    name: path.split("/").pop() ?? path,
    isStarred: false,
    starredAt: null
  };
}

export function DocPreview({
  path,
  location,
  onNavigatePath,
  onLoaded,
  externalStarUpdate,
  onStarChanged
}: {
  path: string;
  location?: PreviewLocation;
  onNavigatePath: (path: string) => void;
  onLoaded?: (path: string) => void;
  externalStarUpdate?: DocStarUpdate | null;
  onStarChanged?: (path: string, isStarred: boolean, starredAt?: string | null) => void;
}): React.JSX.Element {
  const previewCacheRef = React.useRef<Map<string, FilePreviewPayload>>(new Map());
  const [data, setData] = React.useState<FilePreviewPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [starState, setStarState] = React.useState<DocStarStatus | null>(null);
  const [starSaving, setStarSaving] = React.useState(false);
  const [copyFeedback, setCopyFeedback] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
  const [outlineCollapsed, setOutlineCollapsed] = React.useState(true);
  const [fullContentPath, setFullContentPath] = React.useState<string | null>(null);
  const [exportMenuAnchor, setExportMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [exportingFormat, setExportingFormat] = React.useState<DocExportFormat | null>(null);
  const fullContentRequested = fullContentPath === path;
  const previewCacheKey = fullContentRequested ? `${path}::full` : `${path}::preview`;
  const previewRequestUrl = fullContentRequested
    ? `/api/docs/file?path=${encodeURIComponent(path)}&full=1`
    : `/api/docs/file?path=${encodeURIComponent(path)}`;
  const markdownContent = data?.kind === "markdown" ? data.markdown?.renderedContent ?? data.content : "";
  const markdownHeadings = data?.kind === "markdown" ? data.markdown?.headings ?? [] : [];
  const codePreviewLocation = data?.kind === "code" || data?.kind === "text" ? location : undefined;
  const onLoadedRef = React.useRef(onLoaded);

  React.useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const writePreviewCache = React.useCallback((cacheKey: string, payload: FilePreviewPayload) => {
    const current = previewCacheRef.current;
    if (current.has(cacheKey)) {
      current.delete(cacheKey);
    }
    current.set(cacheKey, payload);

    // Keep recent previews to speed up frequent back-and-forth reads.
    if (current.size > 80) {
      const oldestKey = current.keys().next().value;
      if (typeof oldestKey === "string") {
        current.delete(oldestKey);
      }
    }
  }, []);

  const patchCachedStarState = React.useCallback((nextStarState: DocStarStatus) => {
    for (const [cacheKey, payload] of Array.from(previewCacheRef.current.entries())) {
      if (payload.path !== nextStarState.path) {
        continue;
      }

      writePreviewCache(cacheKey, {
        ...payload,
        star: nextStarState
      });
    }
  }, [writePreviewCache]);

  React.useEffect(() => {
    if (!path) {
      setData(null);
      setStarState(null);
      return;
    }

    const cached = previewCacheRef.current.get(previewCacheKey);
    if (cached) {
      setData(cached);
      setStarState(cached.star ?? buildFallbackStarState(cached.path));
      setError("");
      setLoading(false);
      onLoadedRef.current?.(cached.path);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(previewRequestUrl, {
          signal: controller.signal
        });

        const payload = (await response.json()) as FilePreviewPayload & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "加载文件失败");
        }

        if (!active) {
          return;
        }

        setData(payload);
        setStarState(payload.star ?? buildFallbackStarState(payload.path));
        writePreviewCache(previewCacheKey, payload);
        onLoadedRef.current?.(payload.path);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "加载文件失败");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, previewCacheKey, previewRequestUrl, writePreviewCache]);

  React.useEffect(() => {
    if (!externalStarUpdate || externalStarUpdate.path !== path) {
      return;
    }

    const nextStarState: DocStarStatus = {
      path,
      name: path.split("/").pop() ?? path,
      isStarred: externalStarUpdate.isStarred,
      starredAt: externalStarUpdate.starredAt
    };
    setStarState(nextStarState);
    patchCachedStarState(nextStarState);
  }, [externalStarUpdate, patchCachedStarState, path]);

  React.useEffect(() => {
    if (!data || data.kind !== "markdown") {
      return;
    }

    if (location?.line && Number.isFinite(location.line) && location.line > 0) {
      const directLineAnchor = document.getElementById(`line-${location.line}`);
      if (directLineAnchor) {
        directLineAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const nearestHeading = [...markdownHeadings]
        .reverse()
        .find((heading) => heading.line <= location.line!);

      if (nearestHeading) {
        const headingAnchor = document.getElementById(nearestHeading.slug);
        if (headingAnchor) {
          headingAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }

      const markdownRoot = document.getElementById("markdown-preview-root");
      if (markdownRoot) {
        markdownRoot.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (location?.heading) {
      const decodedHeading = decodeURIComponent(location.heading);
      const byId = document.getElementById(decodedHeading);
      const normalizedId = decodedHeading.toLowerCase().replace(/\s+/g, "-");
      const byNormalizedId = document.getElementById(normalizedId);
      const matchedHeading = markdownHeadings.find((heading) => heading.slug === decodedHeading || heading.text === decodedHeading);
      const headingElement = byId ?? byNormalizedId ?? (matchedHeading ? document.getElementById(matchedHeading.slug) : null);
      if (headingElement) {
        headingElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [data, location?.heading, location?.line, markdownHeadings]);

  const handleMarkdownPathNavigate = React.useCallback(
    (targetPath: string, anchorHash: string) => {
      if (targetPath === path) {
        if (anchorHash) {
          window.location.hash = anchorHash;
        }
        return;
      }

      onNavigatePath(targetPath);
      if (anchorHash) {
        window.setTimeout(() => {
          window.location.hash = anchorHash;
        }, 0);
      }
    },
    [onNavigatePath, path]
  );

  const handleExport = React.useCallback(
    async (format: DocExportFormat) => {
      setExportMenuAnchor(null);
      setExportingFormat(format);

      try {
        const response = await fetch(`/api/docs/export?path=${encodeURIComponent(path)}&format=${format}`);
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "导出失败");
        }

        const blob = await response.blob();
        const fallbackFileName = `${path.split("/").pop() ?? "doclens"}-详情页.${format}`;
        const downloadFileName = getDownloadFileName(response.headers.get("content-disposition"), fallbackFileName);
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = downloadFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(objectUrl);

        setCopyFeedback({
          severity: "success",
          message: `已开始下载 ${format.toUpperCase()} 文档`
        });
      } catch (downloadError) {
        setCopyFeedback({
          severity: "error",
          message: downloadError instanceof Error ? downloadError.message : "导出文档失败"
        });
      } finally {
        setExportingFormat(null);
      }
    },
    [path]
  );

  const handleToggleStar = React.useCallback(async () => {
    if (!path || starSaving) {
      return;
    }

    const nextStarred = !(starState?.isStarred ?? false);
    setStarSaving(true);

    try {
      const response = await fetch("/api/docs/stars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, isStarred: nextStarred })
      });
      const payload = (await response.json()) as DocStarStatus & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "更新星标失败");
      }

      setStarState(payload);
      patchCachedStarState(payload);
      onStarChanged?.(payload.path, payload.isStarred, payload.starredAt);
      setCopyFeedback({
        severity: "success",
        message: payload.isStarred ? "已加入星标" : "已取消星标"
      });
    } catch (toggleError) {
      setCopyFeedback({
        severity: "error",
        message: toggleError instanceof Error ? toggleError.message : "更新星标失败"
      });
    } finally {
      setStarSaving(false);
    }
  }, [onStarChanged, patchCachedStarState, path, starSaving, starState?.isStarred]);

  const previewBody = React.useMemo(() => {
    if (loading || error || !data) {
      return null;
    }

    return (
      <>
        {data.truncated ? (
          <Alert
            severity="warning"
            action={
              fullContentRequested ? (
                <Button color="inherit" size="small" disabled>
                  完整页面数据加载中
                </Button>
              ) : (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setFullContentPath(path);
                  }}
                >
                  显示完整页面数据
                </Button>
              )
            }
          >
            文件过大，已按策略截断预览，省略 {data.truncatedLines} 行。
          </Alert>
        ) : null}

        {data.kind === "markdown" ? (
          <DocMarkdownPreviewBody
            path={path}
            markdownContent={markdownContent}
            markdownHeadings={markdownHeadings}
            outlineCollapsed={outlineCollapsed}
            onNavigatePath={handleMarkdownPathNavigate}
          />
        ) : null}

        {data.kind === "code" || data.kind === "text" ? <CodeTextPreview content={data.content} filePath={path} location={codePreviewLocation} /> : null}

        {data.kind === "pdf" ? (
          <Paper variant="outlined" sx={{ minHeight: "65vh", overflow: "hidden" }}>
            <Box sx={{ px: 1.5, py: 0.8, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="caption" color="text.secondary">
                内嵌 PDF 预览
              </Typography>
            </Box>
            <iframe
              src={`/api/docs/file?path=${encodeURIComponent(path)}&raw=1`}
              title={path}
              width="100%"
              height="860"
              style={{ border: 0 }}
            />
          </Paper>
        ) : null}

        {data.kind === "binary" ? (
          <Alert
            severity="info"
            action={
              <Button
                size="small"
                variant="outlined"
                href={`/api/docs/file?path=${encodeURIComponent(path)}&raw=1`}
                target="_blank"
                rel="noreferrer"
              >
                下载
              </Button>
            }
          >
            当前文件不支持文本预览，请下载查看。
          </Alert>
        ) : null}
      </>
    );
  }, [codePreviewLocation, data, error, fullContentRequested, handleMarkdownPathNavigate, loading, markdownContent, markdownHeadings, outlineCollapsed, path]);

  if (!path) {
    return <EmptyState title="请选择文件" description="从左侧目录树选择一个文档开始预览" />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Box sx={{ p: 0.2 }}>
        <DocBreadcrumb path={path} onNavigate={onNavigatePath} />
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>
              {path.split("/").pop()}
            </Typography>
            {data ? (
              <>
                <Chip label={data.kind.toUpperCase()} size="small" color="primary" variant="outlined" />
                <Typography variant="caption" color="text.secondary">
                  {formatBytes(data.size)}
                </Typography>
              </>
            ) : null}
          </Stack>

          <Stack direction="row" gap={0.5}>
            <Tooltip title={starState?.isStarred ? "取消星标" : "加入星标"}>
              <span>
                <IconButton
                  size="small"
                  aria-label={starState?.isStarred ? "remove doc star" : "add doc star"}
                  aria-pressed={starState?.isStarred ?? false}
                  sx={{
                    width: 40,
                    height: 40,
                    border: "1px solid",
                    borderColor: starState?.isStarred ? "warning.main" : "divider",
                    bgcolor: starState?.isStarred ? "rgba(245,158,11,0.12)" : "background.paper",
                    color: starState?.isStarred ? "warning.dark" : "text.secondary"
                  }}
                  onClick={() => {
                    void handleToggleStar();
                  }}
                  disabled={starSaving}
                >
                  {starSaving ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : starState?.isStarred ? (
                    <StarRoundedIcon fontSize="small" />
                  ) : (
                    <StarBorderRoundedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="复制路径">
              <IconButton
                size="small"
                aria-label="copy path"
                sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
                onClick={async () => {
                  await navigator.clipboard.writeText(`docs/${path}`);
                  setCopyFeedback({
                    severity: "success",
                    message: "已复制 docs 路径"
                  });
                }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="保存为 Word 文档">
              <span>
                <IconButton
                  size="small"
                  aria-label="save as word document"
                  sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
                  onClick={(event) => {
                    setExportMenuAnchor(event.currentTarget);
                  }}
                  disabled={Boolean(exportingFormat)}
                >
                  {exportingFormat ? <CircularProgress size={16} /> : <DescriptionOutlinedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Menu
              anchorEl={exportMenuAnchor}
              open={Boolean(exportMenuAnchor)}
              onClose={() => {
                if (!exportingFormat) {
                  setExportMenuAnchor(null);
                }
              }}
            >
              <MenuItem
                disabled={Boolean(exportingFormat)}
                onClick={() => {
                  void handleExport("docx");
                }}
              >
                <ListItemText primary="保存为 .docx" secondary="标准 Word 格式，长期优先推荐" />
              </MenuItem>
              <MenuItem
                disabled={Boolean(exportingFormat)}
                onClick={() => {
                  void handleExport("doc");
                }}
              >
                <ListItemText primary="保存为 .doc" secondary="兼容旧版 Word 打开方式" />
              </MenuItem>
            </Menu>
            {data?.kind === "markdown" ? (
              <Tooltip title="复制 Markdown 源文件">
                <IconButton
                  size="small"
                  aria-label="copy markdown source"
                  sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
                  onClick={async () => {
                    try {
                      const response = await fetch(`/api/docs/file?path=${encodeURIComponent(path)}&raw=1`);
                      if (!response.ok) {
                        throw new Error("failed to load markdown source");
                      }

                      const markdownSource = await response.text();
                      await navigator.clipboard.writeText(markdownSource);
                      setCopyFeedback({
                        severity: "success",
                        message: "已复制 Markdown 源文件"
                      });
                    } catch {
                      setCopyFeedback({
                        severity: "error",
                        message: "复制 Markdown 源文件失败"
                      });
                    }
                  }}
                >
                  <ArticleOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            <Tooltip title="打开原文件">
              <IconButton
                size="small"
                aria-label="open raw"
                sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
                component="a"
                href={`/api/docs/file?path=${encodeURIComponent(path)}&raw=1`}
                target="_blank"
                rel="noreferrer"
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {data?.kind === "markdown" && markdownHeadings.length > 0 ? (
              <Tooltip title={outlineCollapsed ? "展开大纲" : "收起大纲"}>
                <IconButton
                  size="small"
                  aria-label={outlineCollapsed ? "展开文档大纲" : "收起文档大纲"}
                  sx={{ border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}
                  onClick={() => {
                    setOutlineCollapsed((prev) => !prev);
                  }}
                >
                  {outlineCollapsed ? <KeyboardDoubleArrowLeftIcon fontSize="small" /> : <KeyboardDoubleArrowRightIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        </Stack>
      </Box>

      <Divider />

      {loading ? <LoadingState label="文件加载中..." /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      {previewBody}

      <Snackbar
        open={Boolean(copyFeedback)}
        autoHideDuration={2200}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => {
          setCopyFeedback(null);
        }}
      >
        <Alert
          severity={copyFeedback?.severity ?? "success"}
          variant="filled"
          onClose={() => {
            setCopyFeedback(null);
          }}
        >
          {copyFeedback?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
