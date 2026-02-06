"use client";

import * as React from "react";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
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
  Snackbar,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { FilePreviewPayload } from "@/features/docs/domain/types";
import { extractMarkdownHeadings } from "@/features/docs/domain/markdownHeading";
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

function languageFromCodeClassName(className?: string): string {
  const matched = /language-([a-zA-Z0-9-]+)/.exec(className ?? "");
  return matched?.[1] ?? "text";
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

export function DocPreview({
  path,
  location,
  onNavigatePath,
  onLoaded
}: {
  path: string;
  location?: PreviewLocation;
  onNavigatePath: (path: string) => void;
  onLoaded?: (path: string) => void;
}): React.JSX.Element {
  const [data, setData] = React.useState<FilePreviewPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copyFeedback, setCopyFeedback] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
  const markdownHeadings = React.useMemo(() => {
    if (!data || data.kind !== "markdown") {
      return [];
    }

    return extractMarkdownHeadings(data.content);
  }, [data]);

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
        onLoaded?.(payload.path);
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
  }, [onLoaded, path]);

  React.useEffect(() => {
    if (!data || data.kind !== "markdown") {
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
  }, [data, location?.heading, markdownHeadings]);

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
            {data?.kind === "markdown" ? (
              <Tooltip title="复制 Markdown 源文件">
                <IconButton
                  size="small"
                  aria-label="copy markdown source"
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
              {(() => {
                let headingRenderIndex = 0;
                const renderHeading =
                  (tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
                  ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element => {
                    const heading = markdownHeadings[headingRenderIndex];
                    headingRenderIndex += 1;
                    return React.createElement(tag, { ...props, id: heading?.slug }, children);
                  };

                return (
              <Paper
                variant="outlined"
                sx={{
                  flex: 1,
                  p: { xs: 1.5, md: 2.5 },
                  overflowX: "auto",
                  minHeight: 220,
                  "& p": { lineHeight: 1.75 },
                  "& blockquote": {
                    m: 0,
                    px: 1.5,
                    py: 0.75,
                    borderLeft: "4px solid #A8C7E6",
                    bgcolor: "rgba(11,114,133,0.05)",
                    color: "text.secondary"
                  },
                  "& table": {
                    width: "100%",
                    borderCollapse: "collapse",
                    my: 1.5
                  },
                  "& th, & td": {
                    border: "1px solid #D7E4EE",
                    px: 1,
                    py: 0.8,
                    textAlign: "left"
                  },
                  "& th": {
                    bgcolor: "#F5F9FD"
                  },
                  "& code": {
                    fontFamily: "var(--font-ibm-plex-mono)"
                  }
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSlug]}
                  components={{
                    h1: renderHeading("h1"),
                    h2: renderHeading("h2"),
                    h3: renderHeading("h3"),
                    h4: renderHeading("h4"),
                    h5: renderHeading("h5"),
                    h6: renderHeading("h6"),
                    code({ className, children }) {
                      const rawValue = String(children ?? "");
                      const value = rawValue.replace(/\n$/, "");
                      const language = languageFromCodeClassName(className);
                      const inline = !className && !rawValue.includes("\n");

                      if (inline) {
                        return (
                          <Box
                            component="code"
                            sx={{
                              px: 0.6,
                              py: 0.2,
                              borderRadius: 0.6,
                              bgcolor: "rgba(15,23,42,0.08)",
                              color: "#0f172a",
                              fontSize: "0.88em"
                            }}
                          >
                            {value}
                          </Box>
                        );
                      }

                      return (
                        <SyntaxHighlighter
                          language={language}
                          style={oneLight}
                          showLineNumbers
                          wrapLines
                          lineProps={(lineNumber) => ({
                            style: {
                              display: "block",
                              backgroundColor: lineNumber % 2 === 0 ? "rgba(148,163,184,0.08)" : "transparent"
                            }
                          })}
                          lineNumberStyle={{
                            minWidth: "2.5em",
                            paddingLeft: "12px",
                            paddingRight: "12px",
                            color: "#64748B",
                            userSelect: "none"
                          }}
                          customStyle={{
                            margin: 0,
                            padding: "12px 0",
                            border: "1px solid #D7E4EE",
                            borderRadius: "10px",
                            fontSize: "13px",
                            lineHeight: 1.65,
                            background: "#F8FAFC"
                          }}
                          codeTagProps={{
                            style: {
                              fontFamily: "var(--font-ibm-plex-mono)"
                            }
                          }}
                        >
                          {value}
                        </SyntaxHighlighter>
                      );
                    }
                  }}
                >
                  {data.content}
                </ReactMarkdown>
              </Paper>
                );
              })()}
              <Box sx={{ width: { xs: "100%", lg: 260 }, flexShrink: 0 }}>
                <DocOutline headings={markdownHeadings} />
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
