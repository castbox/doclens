"use client";

import * as React from "react";
import { Box, Paper, Stack } from "@mui/material";
import MarkdownPreview from "@uiw/react-markdown-preview";
import rehypeSanitize from "rehype-sanitize";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { MarkdownHeading } from "@/features/docs/domain/markdownHeading";
import { buildAnchorHash, resolveMarkdownDocPath } from "@/features/docs/domain/markdownPreviewTransform";
import { markdownSanitizeSchema } from "@/features/docs/domain/markdownSanitize";
import { isMermaidLanguage, normalizeCodeBlockSource } from "@/features/docs/domain/mermaid";
import { DocOutline } from "@/features/docs/ui/DocOutline";
import { MermaidCodeBlock } from "@/features/docs/ui/MermaidCodeBlock";

const ORANGE_CODE_COLOR = "#E96900";
const INLINE_CODE_BG = "#F8F8F8";

const codeSyntaxTheme = Object.fromEntries(
  Object.entries(oneLight).map(([selector, style]) => {
    return [selector, { ...(style as React.CSSProperties), color: ORANGE_CODE_COLOR }];
  })
) as typeof oneLight;

function languageFromCodeClassName(className?: string): string {
  const matched = /language-([a-zA-Z0-9-]+)/.exec(className ?? "");
  return matched?.[1] ?? "text";
}

export function DocMarkdownPreviewBody({
  path,
  markdownContent,
  markdownHeadings,
  outlineCollapsed,
  onNavigatePath
}: {
  path: string;
  markdownContent: string;
  markdownHeadings: MarkdownHeading[];
  outlineCollapsed: boolean;
  onNavigatePath: (targetPath: string, anchorHash: string) => void;
}): React.JSX.Element {
  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", md: "flex-start" } }}>
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
            id="markdown-preview-root"
            variant="outlined"
            sx={{
              flex: 1,
              width: "100%",
              minWidth: 0,
              p: { xs: 1.5, md: 2.25 },
              overflowX: "hidden",
              minHeight: 220,
              "& p": { lineHeight: 1.72, color: "text.primary" },
              "& p, & li, & td, & th, & blockquote, & a": {
                overflowWrap: "anywhere",
                wordBreak: "break-word"
              },
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
            <MarkdownPreview
              source={markdownContent}
              disableCopy
              wrapperElement={{ "data-color-mode": "light" }}
              rehypeRewrite={(node, _index, parent) => {
                if (
                  node.type === "element" &&
                  node.tagName === "a" &&
                  parent &&
                  parent.type === "element" &&
                  /^h[1-6]$/.test(parent.tagName) &&
                  node.properties?.ariaHidden === "true"
                ) {
                  parent.children = parent.children.filter((child) => child !== node);
                }
              }}
              pluginsFilter={(type, plugins) => {
                if (type !== "rehype") {
                  return plugins;
                }

                const filtered = plugins.filter((plugin) => {
                  if (!Array.isArray(plugin)) {
                    return true;
                  }

                  const pluginOptions = plugin[1];
                  if (pluginOptions && typeof pluginOptions === "object" && "ignoreMissing" in pluginOptions) {
                    return false;
                  }

                  return true;
                });

                return [...filtered, [rehypeSanitize, markdownSanitizeSchema]];
              }}
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
                          onNavigatePath(targetPath, anchorHash);
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
                  const value = normalizeCodeBlockSource(rawValue);
                  const language = languageFromCodeClassName(className);
                  const inline = !className && !rawValue.includes("\n");
                  const mermaid = isMermaidLanguage(className);
                  const inlineDocsPath = value.trim();
                  const inlineTargetPath =
                    inline && inlineDocsPath.startsWith("docs/") ? resolveMarkdownDocPath(inlineDocsPath, path) : null;

                  if (mermaid) {
                    return <MermaidCodeBlock code={value} syntaxTheme={codeSyntaxTheme} />;
                  }

                  if (inline && inlineTargetPath) {
                    const anchorHash = buildAnchorHash(inlineDocsPath);
                    const targetHash = anchorHash ? `#${anchorHash}` : "";

                    return (
                      <a
                        href={`/docs?path=${encodeURIComponent(inlineTargetPath)}${targetHash}`}
                        style={{ textDecoration: "none" }}
                        onClick={(event) => {
                          event.preventDefault();
                          onNavigatePath(inlineTargetPath, anchorHash);
                        }}
                      >
                        <Box
                          component="code"
                          sx={{
                            px: "5px",
                            py: "3px",
                            mx: "2px",
                            borderRadius: "2px",
                            bgcolor: INLINE_CODE_BG,
                            color: "var(--mui-palette-secondary-main)",
                            textDecoration: "underline",
                            fontSize: "0.88em",
                            whiteSpace: "pre-wrap",
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            cursor: "pointer"
                          }}
                        >
                          {value}
                        </Box>
                      </a>
                    );
                  }

                  if (inline) {
                    return (
                      <Box
                        component="code"
                        sx={{
                          px: "5px",
                          py: "3px",
                          mx: "2px",
                          borderRadius: "2px",
                          bgcolor: INLINE_CODE_BG,
                          color: ORANGE_CODE_COLOR,
                          fontSize: "0.88em",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word"
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
                      wrapLongLines
                      lineProps={() => ({
                        style: {
                          display: "block",
                          backgroundColor: "transparent",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word"
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
                        background: "#F8F8F8",
                        overflowX: "hidden"
                      }}
                      codeTagProps={{
                        style: {
                          fontFamily: "var(--font-ibm-plex-mono)",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word"
                        }
                      }}
                    >
                      {value}
                    </SyntaxHighlighter>
                  );
                }
              }}
            />
          </Paper>
        );
      })()}
      {markdownHeadings.length > 0 && !outlineCollapsed ? (
        <Box
          sx={{
            width: { xs: "100%", md: "clamp(220px, 24vw, 320px)" },
            flexShrink: 0,
            position: { xs: "static", md: "sticky" },
            top: { md: 76 },
            alignSelf: { md: "flex-start" },
            zIndex: 2,
            height: "fit-content"
          }}
        >
          <DocOutline headings={markdownHeadings} />
        </Box>
      ) : null}
    </Stack>
  );
}
