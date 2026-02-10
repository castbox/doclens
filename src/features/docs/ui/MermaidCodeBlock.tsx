"use client";

import * as React from "react";
import { Alert, Box, CircularProgress } from "@mui/material";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

type MermaidCodeBlockProps = {
  code: string;
  syntaxTheme: { [key: string]: React.CSSProperties };
};

let mermaidModulePromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => {
      const mermaid = module.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true
      });
      return mermaid;
    });
  }

  return mermaidModulePromise;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function MermaidCodeBlock({ code, syntaxTheme }: MermaidCodeBlockProps): React.JSX.Element {
  const renderIdRef = React.useRef(randomId("doclens-mermaid"));
  const [svg, setSvg] = React.useState<string>("");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    const renderMermaid = async () => {
      setLoading(true);
      setErrorMessage("");
      setSvg("");

      if (!code.trim()) {
        if (!active) {
          return;
        }

        setErrorMessage("Mermaid 图表内容为空");
        setLoading(false);
        return;
      }

      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(renderIdRef.current, code);
        if (!active) {
          return;
        }

        setSvg(svg);
      } catch (error) {
        if (!active) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Mermaid 渲染失败");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void renderMermaid();

    return () => {
      active = false;
    };
  }, [code]);

  return (
    <Box sx={{ my: 0.5 }}>
      <Box
        sx={{
          border: "1px solid #D7E4EE",
          borderRadius: "10px",
          bgcolor: "#FFFFFF",
          p: 1.5,
          overflowX: "auto",
          "& svg": {
            display: "block",
            maxWidth: "100%",
            height: "auto",
            marginInline: "auto"
          }
        }}
      >
        {loading ? (
          <Box sx={{ minHeight: 180, display: "grid", placeItems: "center" }}>
            <CircularProgress size={28} />
          </Box>
        ) : null}
        {!loading && svg ? <Box dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      </Box>

      {errorMessage ? (
        <Box sx={{ mt: 1 }}>
          <Alert severity="warning" sx={{ mb: 1 }}>
            Mermaid 渲染失败：{errorMessage}
          </Alert>
          <SyntaxHighlighter
            language="mermaid"
            style={syntaxTheme}
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
            {code}
          </SyntaxHighlighter>
        </Box>
      ) : null}
    </Box>
  );
}
