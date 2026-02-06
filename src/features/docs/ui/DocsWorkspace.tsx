"use client";

import * as React from "react";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { AppBar, Box, Button, Container, Divider, Drawer, Paper, Stack, Toolbar, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseLocationAnchor, stripPathAnchor } from "@/features/docs/domain/anchor";
import { DocPreview } from "@/features/docs/ui/DocPreview";
import { DocsTree } from "@/features/docs/ui/DocsTree";
import { SearchPanel } from "@/features/search/ui/SearchPanel";
import { ReviewDrawer } from "@/features/reviews/ui/ReviewDrawer";

const DOCS_DRAWER_WIDTH = 320;
const REVIEW_DRAWER_WIDTH = 360;
const APP_HEADER_HEIGHT = 64;

export function DocsWorkspace(): React.JSX.Element {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const isLgUp = useMediaQuery(theme.breakpoints.up("lg"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPathParam = searchParams.get("path") ?? "";
  const pathParam = React.useMemo(() => stripPathAnchor(rawPathParam), [rawPathParam]);

  const [selectedPath, setSelectedPath] = React.useState(pathParam);
  const [location, setLocation] = React.useState<{ line?: number; heading?: string }>({});
  const [showSearch, setShowSearch] = React.useState(true);
  const [docsDrawerOpen, setDocsDrawerOpen] = React.useState(true);
  const [reviewDrawerOpen, setReviewDrawerOpen] = React.useState(false);
  const [reviewRefreshToken, setReviewRefreshToken] = React.useState(0);
  const latestReadPath = React.useRef("");

  React.useEffect(() => {
    setSelectedPath(pathParam);
  }, [pathParam]);

  React.useEffect(() => {
    const hashIndex = rawPathParam.indexOf("#");
    if (hashIndex < 0) {
      return;
    }

    const inlineAnchor = parseLocationAnchor(rawPathParam.slice(hashIndex));
    if (!inlineAnchor.line && !inlineAnchor.heading) {
      return;
    }

    setLocation(inlineAnchor);
  }, [rawPathParam]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const applyHash = () => {
      setLocation(parseLocationAnchor(window.location.hash));
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  }, []);

  React.useEffect(() => {
    if (!isMdUp && docsDrawerOpen) {
      setDocsDrawerOpen(false);
    }
  }, [docsDrawerOpen, isMdUp]);

  React.useEffect(() => {
    if (isLgUp) {
      setReviewDrawerOpen(true);
    }
  }, [isLgUp]);

  const selectPath = React.useCallback(
    (path: string, line?: number) => {
      const safePath = stripPathAnchor(path);
      const params = new URLSearchParams(searchParams.toString());
      if (safePath) {
        params.set("path", safePath);
      } else {
        params.delete("path");
      }

      const nextUrl = `/docs?${params.toString()}`;
      const hash = line ? `#L${line}` : "";

      router.replace(`${nextUrl}${hash}`);
      setSelectedPath(path);
      setLocation(line ? { line } : {});

      if (!isMdUp) {
        setDocsDrawerOpen(false);
      }
    },
    [isMdUp, router, searchParams]
  );

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "rgba(243,247,251,0.86)"
        }}
      >
        <Toolbar sx={{ minHeight: `${APP_HEADER_HEIGHT}px !important`, px: { xs: 1, md: 1.5 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" width="100%" gap={1} flexWrap="wrap">
            <Stack direction="row" alignItems="center" gap={1.2}>
              <Typography variant="h6" fontWeight={800} letterSpacing="-0.02em">
                DocLens
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Docs 浏览 + 搜索 + 审阅工作台
              </Typography>
            </Stack>

            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button
                size="small"
                variant={docsDrawerOpen ? "contained" : "outlined"}
                startIcon={<MenuBookOutlinedIcon />}
                onClick={() => setDocsDrawerOpen((prev) => !prev)}
              >
                {docsDrawerOpen ? "收起目录" : "展开目录"}
              </Button>
              <Button
                size="small"
                variant={showSearch ? "contained" : "outlined"}
                startIcon={<SearchIcon />}
                onClick={() => setShowSearch((prev) => !prev)}
              >
                {showSearch ? "隐藏搜索" : "显示搜索"}
              </Button>
              <Button size="small" variant="outlined" component={Link} href="/search">
                搜索页
              </Button>
              <Button size="small" variant="outlined" component={Link} href="/reviews">
                审阅列表
              </Button>
            </Stack>
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={docsDrawerOpen}
        onClose={() => setDocsDrawerOpen(false)}
        variant={isMdUp ? "persistent" : "temporary"}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DOCS_DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DOCS_DRAWER_WIDTH,
            boxSizing: "border-box",
            p: { xs: 1.2, md: 1.25 },
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            top: APP_HEADER_HEIGHT,
            height: `calc(100dvh - ${APP_HEADER_HEIGHT}px)`
          }
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={700}>
            Docs 目录
          </Typography>
          <Button size="small" onClick={() => setDocsDrawerOpen(false)}>
            收起
          </Button>
        </Stack>
        <Divider sx={{ my: 1 }} />
        <DocsTree
          selectedPath={selectedPath}
          onSelectFile={(path) => {
            selectPath(path);
          }}
        />
      </Drawer>

      <Container
        maxWidth={false}
        sx={{
          py: { xs: 1.5, md: 1.25 },
          px: { xs: 1, sm: 1.25, md: 1.5 },
          pl: { xs: 1, md: docsDrawerOpen ? `${DOCS_DRAWER_WIDTH + 16}px` : 1.5 },
          pr: { xs: 1, sm: 1.25, md: 1.5, lg: reviewDrawerOpen ? `${REVIEW_DRAWER_WIDTH + 20}px` : 1.5 },
          transition: "padding 180ms ease"
        }}
      >
        <Stack spacing={1.2}>
          {showSearch ? (
            <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.2 }, bgcolor: "rgba(255,255,255,0.9)" }}>
              <SearchPanel
                initialQuery=""
                scope=""
                onOpenHit={(path, line) => {
                  selectPath(path, line);
                }}
              />
            </Paper>
          ) : null}

          <Paper
            variant="outlined"
            sx={{
              position: "relative",
              p: { xs: 1, md: 1.25 },
              minHeight: "78vh",
              overflow: "visible",
              bgcolor: "rgba(255,255,255,0.94)"
            }}
          >
            <DocPreview
              path={selectedPath}
              location={location}
              onNavigatePath={(path) => {
                selectPath(path);
              }}
              onLoaded={async (path) => {
                if (!path.startsWith("pr/") || latestReadPath.current === path) {
                  return;
                }

                latestReadPath.current = path;
                try {
                  const response = await fetch("/api/reviews/pr-files/read", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path, isRead: true })
                  });

                  if (response.ok) {
                    setReviewRefreshToken((prev) => prev + 1);
                  }
                } catch {
                  // Ignore mark-read failures to avoid blocking preview rendering.
                }
              }}
            />
          </Paper>
        </Stack>
      </Container>

      <ReviewDrawer
        open={reviewDrawerOpen}
        onOpenChange={setReviewDrawerOpen}
        selectedPath={selectedPath}
        refreshToken={reviewRefreshToken}
        onOpenFile={(path) => {
          selectPath(path);
        }}
      />
    </Box>
  );
}
