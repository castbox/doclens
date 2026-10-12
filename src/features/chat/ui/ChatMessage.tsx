"use client";

import * as React from "react";
import {
  Avatar,
  Box,
  CircularProgress,
  Paper,
  Typography,
  useTheme
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import MarkdownPreview from "@uiw/react-markdown-preview";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeSanitize from "rehype-sanitize";
import type { ChatMessage as ChatMessageData } from "@/features/chat/domain/types";
import { markdownSanitizeSchema } from "@/features/docs/domain/markdownSanitize";
import { isMermaidLanguage, normalizeCodeBlockSource } from "@/features/docs/domain/mermaid";
import { MermaidCodeBlock } from "@/features/docs/ui/MermaidCodeBlock";

type MarkdownBoundaryProps = {
  children: React.ReactNode;
  content: string;
};

type MarkdownBoundaryState = {
  hasError: boolean;
};

class MarkdownRenderBoundary extends React.Component<MarkdownBoundaryProps, MarkdownBoundaryState> {
  state: MarkdownBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MarkdownBoundaryState {
    return { hasError: true };
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Typography
          component="div"
          sx={{
            fontSize: 16,
            lineHeight: 1.75,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            color: "text.primary"
          }}
        >
          {this.props.content}
        </Typography>
      );
    }

    return this.props.children;
  }
}

function isSafeHref(href: unknown): href is string {
  if (typeof href !== "string" || href.trim() === "") {
    return false;
  }

  if (href.startsWith("#")) {
    return true;
  }

  try {
    const parsed = new URL(href, "https://doclens.invalid");
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function getMarkdownComponents(
  deferMermaidRender: boolean,
  mermaidStatus: "pending" | "streaming"
): React.ComponentProps<typeof MarkdownPreview>["components"] {
  return {
    a({ href, children, title }) {
      if (!isSafeHref(href)) {
        return <>{children}</>;
      }

      return (
        <a href={href} title={title} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    code({ className, children }) {
      const rawValue = String(children ?? "");

      if (isMermaidLanguage(className)) {
        if (deferMermaidRender) {
          return (
            <Box
              data-mermaid-block="true"
              sx={{
                width: "100%",
                minWidth: 0,
                my: 1.5,
                px: 2,
                py: 1.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                bgcolor: "action.hover",
                color: "text.secondary"
              }}
            >
              {mermaidStatus === "pending" ? "等待生成图表…" : "正在生成图表…"}
            </Box>
          );
        }

        return (
          <Box
            data-mermaid-block="true"
            sx={{
              width: "100%",
              minWidth: 0,
              "& > .MuiBox-root": { width: "100%", minWidth: 0 }
            }}
          >
            <MermaidCodeBlock
              code={normalizeCodeBlockSource(rawValue)}
              syntaxTheme={oneLight as { [key: string]: React.CSSProperties }}
              presentation="chat"
            />
          </Box>
        );
      }

      const isBlock = Boolean(className) || rawValue.includes("\n");

      return (
        <Box
          component="code"
          sx={
            isBlock
              ? {
                  display: "block",
                  minWidth: "max-content",
                  color: "text.primary",
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: "0.9em",
                  lineHeight: 1.7,
                  whiteSpace: "pre"
                }
              : {
                  display: "inline",
                  px: 0.65,
                  py: 0.2,
                  borderRadius: 1,
                  color: "text.primary",
                  bgcolor: "action.hover",
                  fontFamily: "var(--font-ibm-plex-mono), monospace",
                  fontSize: "0.88em",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word"
                }
          }
        >
          {rawValue}
        </Box>
      );
    },
    img() {
      // Never fetch model-generated remote images or tracking pixels.
      return null;
    },
    pre({ children }) {
      const hasMermaidCode = React.Children.toArray(children).some((child) => {
        if (
          !React.isValidElement<{
            className?: string;
            "data-mermaid-block"?: string;
          }>(child)
        ) {
          return false;
        }

        return (
          child.props["data-mermaid-block"] === "true" ||
          isMermaidLanguage(child.props.className)
        );
      });

      if (hasMermaidCode) {
        return <>{children}</>;
      }

      return (
        <Box
          component="pre"
          sx={{
            maxWidth: "100%",
            minWidth: 0,
            my: 1.75,
            px: 1.75,
            py: 1.5,
            overflowX: "auto",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            bgcolor: "action.hover",
            fontFamily: "var(--font-ibm-plex-mono), monospace"
          }}
        >
          {children}
        </Box>
      );
    },
    table({ children }) {
      return (
        <Box sx={{ maxWidth: "100%", minWidth: 0, my: 2, overflowX: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "max-content",
              minWidth: "100%",
              borderCollapse: "collapse",
              "& th, & td": {
                px: 1.5,
                py: 1,
                border: 1,
                borderColor: "divider",
                textAlign: "left",
                verticalAlign: "top",
                overflowWrap: "anywhere"
              },
              "& th": { bgcolor: "action.hover", fontWeight: 700 }
            }}
          >
            {children}
          </Box>
        </Box>
      );
    }
  };
}

export function ChatMessage({
  message,
  isStreaming = false
}: {
  message: ChatMessageData;
  isStreaming?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const status =
    message.status === "complete" || message.status === "stopped" || message.status === "error"
      ? message.status
      : isStreaming || message.status === "streaming"
        ? "streaming"
        : "pending";
  const mermaidDeferred = status === "pending" || status === "streaming";
  const mermaidStatus = status === "pending" ? "pending" : "streaming";
  const markdownComponents = React.useMemo(
    () => getMarkdownComponents(mermaidDeferred, mermaidStatus),
    [mermaidDeferred, mermaidStatus]
  );

  if (message.role === "user") {
    return (
      <Box
        component="article"
        aria-label="你的消息"
        sx={{
          display: "flex",
          width: "100%",
          minWidth: 0,
          justifyContent: "flex-end"
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            width: "fit-content",
            maxWidth: { xs: "90%", sm: "78%" },
            minWidth: 0,
            px: { xs: 1.75, sm: 2.25 },
            py: 1.25,
            borderColor: "divider",
            borderRadius: 3,
            bgcolor: "action.hover",
            color: "text.primary"
          }}
        >
          <Typography
            component="div"
            sx={{
              fontSize: 16,
              lineHeight: 1.75,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            }}
          >
            {message.content}
          </Typography>
        </Paper>
      </Box>
    );
  }

  const statusLabel =
    status === "pending"
      ? "等待生成"
      : status === "streaming"
        ? "正在生成"
        : status === "stopped"
          ? "已停止生成"
          : status === "error"
            ? "生成中断"
            : null;

  return (
    <Box
      component="article"
      aria-label="DeepSeek 回复"
      sx={{ width: "100%", minWidth: 0, color: "text.primary" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Avatar
          sx={{
            width: 30,
            height: 30,
            bgcolor: "primary.main",
            color: "primary.contrastText"
          }}
        >
          <AutoAwesomeOutlinedIcon aria-hidden="true" sx={{ fontSize: 17 }} />
        </Avatar>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
          DeepSeek
        </Typography>
        {statusLabel ? (
          <Box
            role={status === "streaming" ? "status" : undefined}
            aria-live={status === "streaming" ? "polite" : undefined}
            sx={{ display: "flex", alignItems: "center", gap: 0.75 }}
          >
            {status === "streaming" ? <CircularProgress size={12} aria-label="正在生成回复" /> : null}
            <Typography variant="caption" color="text.secondary">
              {statusLabel}
            </Typography>
          </Box>
        ) : null}
      </Box>

      <Box
        sx={{
          width: "100%",
          minWidth: 0,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          color: "text.primary",
          "& .wmde-markdown": {
            width: "100%",
            minWidth: 0,
            bgcolor: "transparent !important",
            color: "text.primary",
            fontFamily: "inherit",
            fontSize: 16,
            lineHeight: 1.75,
            overflowWrap: "anywhere",
            wordBreak: "break-word"
          },
          "& .wmde-markdown > *:first-of-type": { mt: 0 },
          "& .wmde-markdown > *:last-child": { mb: 0 },
          "& .wmde-markdown h1, & .wmde-markdown h2, & .wmde-markdown h3, & .wmde-markdown h4, & .wmde-markdown h5, & .wmde-markdown h6": {
            mt: 2.25,
            mb: 1,
            color: "text.primary",
            fontWeight: 700,
            lineHeight: 1.35
          },
          "& .wmde-markdown h1": { fontSize: "1.6rem" },
          "& .wmde-markdown h2": { fontSize: "1.4rem" },
          "& .wmde-markdown h3": { fontSize: "1.2rem" },
          "& .wmde-markdown p, & .wmde-markdown li, & .wmde-markdown blockquote": {
            fontSize: 16,
            lineHeight: 1.75,
            color: "text.primary",
            overflowWrap: "anywhere",
            wordBreak: "break-word"
          },
          "& .wmde-markdown p": { my: 1.25 },
          "& .wmde-markdown ul, & .wmde-markdown ol": {
            pl: 3,
            my: 1.25
          },
          "& .wmde-markdown blockquote": {
            my: 1.75,
            mx: 0,
            px: 2,
            py: 1,
            borderLeft: 3,
            borderColor: "primary.main",
            bgcolor: "action.hover",
            borderRadius: "0 10px 10px 0"
          },
          "& .wmde-markdown a": {
            color: "primary.main",
            textDecoration: "underline",
            textUnderlineOffset: "0.15em",
            overflowWrap: "anywhere"
          },
          "& .wmde-markdown hr": {
            my: 2.5,
            border: 0,
            borderTop: 1,
            borderColor: "divider"
          }
        }}
      >
        <MarkdownRenderBoundary
          key={`${message.id}-${status === "streaming" ? "streaming" : "settled"}`}
          content={message.content}
        >
          {/* The uiw wrapper inverts this option before passing it to react-markdown. */}
          <MarkdownPreview
            source={message.content}
            disableCopy
            skipHtml={false}
            wrapperElement={{ "data-color-mode": theme.palette.mode }}
            components={markdownComponents}
            urlTransform={(url) => (isSafeHref(url) ? url : "")}
            pluginsFilter={(type, plugins) => {
              if (type !== "rehype") {
                return plugins;
              }

              const filtered = plugins.filter((plugin) => {
                const pluginFunction = Array.isArray(plugin) ? plugin[0] : plugin;
                if (typeof pluginFunction === "function" && pluginFunction.name === "rehypeRaw") {
                  return false;
                }

                if (!Array.isArray(plugin)) {
                  return true;
                }

                const pluginOptions = plugin[1];
                return !(
                  pluginOptions &&
                  typeof pluginOptions === "object" &&
                  "ignoreMissing" in pluginOptions
                );
              });

              return [...filtered, [rehypeSanitize, markdownSanitizeSchema]];
            }}
          />
        </MarkdownRenderBoundary>
      </Box>
    </Box>
  );
}
