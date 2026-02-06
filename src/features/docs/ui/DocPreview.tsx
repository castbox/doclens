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

const CODE_TEXT_COLOR = "#1F2937";
const INLINE_CODE_COLOR = "#0F3D4A";
const DOC_MARKDOWN_PATH_PATTERN = /(?:docs\/|\/|\.\.\/|\.\/)[^\s)\]`]+?\.md(?:#[^\s)\]`]+)?/g;

const codeSyntaxTheme = Object.fromEntries(
  Object.entries(oneLight).map(([selector, style]) => {
    return [selector, { ...(style as React.CSSProperties), color: CODE_TEXT_COLOR }];
  })
) as typeof oneLight;

function autoLinkDocsMarkdownPaths(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let currentFenceMarker = "";

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!inFence) {
          inFence = true;
          currentFenceMarker = marker;
        } else if (marker === currentFenceMarker) {
          inFence = false;
          currentFenceMarker = "";
        }
        return line;
      }

      if (inFence) {
        return line;
      }

      return line.replace(DOC_MARKDOWN_PATH_PATTERN, (matched, offset, source) => {
        const start = Number(offset);
        const prefix = source.slice(Math.max(0, start - 2), start);
        if (prefix === "](") {
          return matched;
        }

        return `[${matched}](${matched})`;
      });
    })
    .join("\n");
}

function normalizeDocsRelativePath(inputPath: string): string | null {
  const normalized = inputPath.replace(/\\/g, "/");
  const segments: string[] = [];

  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }

      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

function resolveMarkdownDocPath(href: string | undefined, currentPath: string): string | null {
  if (!href) {
    return null;
  }

  const decodedHref = decodeURIComponent(href).trim();
  if (!decodedHref || decodedHref.startsWith("#")) {
    return null;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decodedHref)) {
    return null;
  }

  const pathOnly = decodedHref.split("#")[0].split("?")[0];
  if (!pathOnly.toLowerCase().endsWith(".md")) {
    return null;
  }

  if (pathOnly.startsWith("docs/")) {
    return normalizeDocsRelativePath(pathOnly.slice("docs/".length));
  }

  if (pathOnly.startsWith("/")) {
    return normalizeDocsRelativePath(pathOnly.slice(1));
  }

  const currentDir = currentPath.includes("/") ? currentPath.slice(0, currentPath.lastIndexOf("/")) : "";
  const merged = currentDir ? `${currentDir}/${pathOnly}` : pathOnly;
  return normalizeDocsRelativePath(merged);
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
      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(238,243,248,0.85)" }}>
        <Typography variant="caption" className="mono" color="text.secondary">
          language: {languageFromFilePath(filePath)}
        </Typography>
      </Box>
      <Box component="pre" sx={{ m: 0, p: 0, fontSize: 13, lineHeight: 1.62, minHeight: 200, whiteSpace: "pre" }}>
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
                bgcolor: highlighted ? "rgba(29,78,216,0.1)" : "transparent",
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
              <Typography component="span" variant="caption" className="mono" sx={{ py: 0.3, color: CODE_TEXT_COLOR }}>
                {line || " "}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

function buildAnchorHash(href: string | undefined): string {
  if (!href || !href.includes("#")) {
    return "";
  }

  const raw = href.slice(href.indexOf("#") + 1).trim();
  if (!raw) {
    return "";
  }

  return decodeURIComponent(raw);
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
  const markdownContent = React.useMemo(() => {
    if (!data || data.kind !== "markdown") {
      return "";
    }

    return autoLinkDocsMarkdownPaths(data.content);
  }, [data]);

  const markdownHeadings = React.useMemo(() => {
    if (!markdownContent) {
      return [];
    }

    return extractMarkdownHeadings(markdownContent);
  }, [markdownContent]);

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
            <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5}>
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
                  p: { xs: 1.5, md: 2.25 },
                  overflowX: "auto",
                  minHeight: 220,
                  maxWidth: { xs: "100%", xl: 900 },
                  "& p": { lineHeight: 1.72, color: "text.primary" },
                  "& h1, & h2, & h3, & h4, & h5, & h6": {
                    scrollMarginTop: 84,
                    lineHeight: 1.3
                  },
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
                  },
                  "& ul, & ol": {
                    paddingInlineStart: "1.5rem"
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
                    a({ href, children, ...props }) {
                      const targetPath = resolveMarkdownDocPath(href, path);
                      if (targetPath) {
                        const anchorHash = buildAnchorHash(href);
                        const targetHash = anchorHash ? `#${anchorHash}` : "";

                        return (
                          <a
                            href={`/docs?path=${encodeURIComponent(targetPath)}${targetHash}`}
                            style={{ color: "var(--mui-palette-secondary-main)", textDecoration: "underline", cursor: "pointer" }}
                            onClick={(event) => {
                              event.preventDefault();

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
                            }}
                            {...props}
                          >
                            {children}
                          </a>
                        );
                      }

                      return (
                        <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--mui-palette-primary-main)" }} {...props}>
                          {children}
                        </a>
                      );
                    },
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
                              bgcolor: "rgba(15,61,74,0.1)",
                              color: INLINE_CODE_COLOR,
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
                          style={codeSyntaxTheme}
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
                            background: "#F7FBFE"
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
                  {markdownContent}
                </ReactMarkdown>
              </Paper>
                );
              })()}
              <Box
                sx={{
                  width: { xs: "100%", lg: 272 },
                  flexShrink: 0,
                  position: { xs: "static", lg: "sticky" },
                  top: { lg: 84 },
                  alignSelf: { lg: "flex-start" }
                }}
              >
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
