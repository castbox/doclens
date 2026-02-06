"use client";

import * as React from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { FilePreviewPayload } from "@/features/docs/domain/types";
import { DocBreadcrumb } from "@/features/docs/ui/DocBreadcrumb";
import { DocOutline } from "@/features/docs/ui/DocOutline";
import { EmptyState, LoadingState } from "@/shared/ui/StateCard";

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
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(11,114,133,0.06)" }}>
        <Typography variant="caption" className="mono" color="text.secondary">
          language: {languageFromFilePath(filePath)}
        </Typography>
      </Box>
      <Box component="pre" sx={{ m: 0, p: 0, fontSize: 13, lineHeight: 1.6, minHeight: 200, whiteSpace: "pre" }}>
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const highlighted = location?.line === lineNumber;

          return (
            <Box
              key={lineNumber}
              id={`line-${lineNumber}`}
              sx={{
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                px: 1,
                bgcolor: highlighted ? "rgba(29,78,216,0.12)" : "transparent"
              }}
            >
              <Typography
                component="span"
                variant="caption"
                className="mono"
                color="text.secondary"
                sx={{ userSelect: "none", py: 0.25 }}
              >
                {lineNumber}
              </Typography>
              <Typography component="span" variant="caption" className="mono" sx={{ py: 0.25, color: "text.primary" }}>
                {line || " "}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

export function DocPreview({ path, location, onNavigatePath }: { path: string; location?: PreviewLocation; onNavigatePath: (path: string) => void }): React.JSX.Element {
  const [data, setData] = React.useState<FilePreviewPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/docs/file?path=${encodeURIComponent(path)}`, {
          signal: controller.signal
        });

        const payload = (await response.json()) as FilePreviewPayload & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "加载文件失败");
        }

        setData(payload);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "加载文件失败");
      } finally {
        setLoading(false);
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [path]);

  React.useEffect(() => {
    if (!data || data.kind !== "markdown") {
      return;
    }

    if (location?.heading) {
      const headingId = location.heading.toLowerCase().replace(/\s+/g, "-");
      const headingElement = document.getElementById(headingId);
      if (headingElement) {
        headingElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [data, location?.heading]);

  if (!path) {
    return <EmptyState title="请选择文件" description="从左侧目录树选择一个文档开始预览" />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box>
        <DocBreadcrumb path={path} onNavigate={onNavigatePath} />
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
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
            <Tooltip title="复制路径">
              <IconButton
                size="small"
                aria-label="copy path"
                onClick={async () => {
                  await navigator.clipboard.writeText(path);
                }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="打开原文件">
              <IconButton
                size="small"
                aria-label="open raw"
                component="a"
                href={`/api/docs/file?path=${encodeURIComponent(path)}&raw=1`}
                target="_blank"
                rel="noreferrer"
              >
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      <Divider />

      {loading ? <LoadingState label="文件加载中..." /> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      {!loading && !error && data ? (
        <>
          {data.truncated ? (
            <Alert severity="warning">文件过大，已按策略截断预览，省略 {data.truncatedLines} 行。</Alert>
          ) : null}

          {data.kind === "markdown" ? (
            <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
              <Paper
                variant="outlined"
                sx={{
                  flex: 1,
                  p: { xs: 1.5, md: 2.5 },
                  overflowX: "auto",
                  minHeight: 220,
                  "& p": { lineHeight: 1.75 },
                  "& pre": {
                    p: 1.25,
                    bgcolor: "#0f172a",
                    color: "#f8fafc",
                    borderRadius: 1.5,
                    overflowX: "auto"
                  },
                  "& code": {
                    fontFamily: "var(--font-ibm-plex-mono)"
                  }
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
                  {data.content}
                </ReactMarkdown>
              </Paper>
              <Box sx={{ width: { xs: "100%", lg: 260 }, flexShrink: 0 }}>
                <DocOutline markdown={data.content} />
              </Box>
            </Stack>
          ) : null}

          {data.kind === "code" || data.kind === "text" ? <CodeTextPreview content={data.content} filePath={path} location={location} /> : null}

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
      ) : null}
    </Box>
  );
}
