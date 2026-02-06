"use client";

import * as React from "react";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { AppBar, Box, Button, Container, Divider, Drawer, Paper, Stack, Toolbar, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseLocationAnchor } from "@/features/docs/domain/anchor";
import { DocPreview } from "@/features/docs/ui/DocPreview";
import { DocsTree } from "@/features/docs/ui/DocsTree";
import { SearchPanel } from "@/features/search/ui/SearchPanel";
import { ReviewDrawer } from "@/features/reviews/ui/ReviewDrawer";

const DOCS_DRAWER_WIDTH = 320;

export function DocsWorkspace(): React.JSX.Element {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathParam = searchParams.get("path") ?? "";

  const [selectedPath, setSelectedPath] = React.useState(pathParam);
  const [location, setLocation] = React.useState<{ line?: number; heading?: string }>({});
  const [showSearch, setShowSearch] = React.useState(true);
  const [docsDrawerOpen, setDocsDrawerOpen] = React.useState(true);
  const [reviewRefreshToken, setReviewRefreshToken] = React.useState(0);
  const latestReadPath = React.useRef("");

  React.useEffect(() => {
    setSelectedPath(pathParam);
  }, [pathParam]);

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

  const selectPath = React.useCallback(
    (path: string, line?: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (path) {
        params.set("path", path);
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
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(10px)", borderBottom: "1px solid #D7E4EE", bgcolor: "rgba(248,252,255,0.82)" }}>
        <Toolbar sx={{ minHeight: "64px !important" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" width="100%" gap={1} flexWrap="wrap">
            <Stack direction="row" alignItems="center" gap={1.2}>
              <Typography variant="h6" fontWeight={800} letterSpacing="-0.02em">
                DocLens
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Docs 浏览 + 搜索 + 审阅工作台
              </Typography>
            </Stack>

            <Stack direction="row" gap={1}>
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
            p: 1.25,
            borderRight: "1px solid #D7E4EE",
            top: 64,
            height: "calc(100dvh - 64px)"
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
          py: 1.25,
          px: { xs: 1, md: 1.5 },
          pl: { xs: 1, md: docsDrawerOpen ? "336px" : 1.5 },
          pr: { lg: "380px" },
          transition: "padding 180ms ease"
        }}
      >
        <Stack spacing={1.25}>
          {showSearch ? (
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <SearchPanel
                initialQuery=""
                scope=""
                onOpenHit={(path, line) => {
                  selectPath(path, line);
                }}
              />
            </Paper>
          ) : null}

          <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.25 }, minHeight: "78vh", overflow: "auto" }}>
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
        selectedPath={selectedPath}
        refreshToken={reviewRefreshToken}
        onOpenFile={(path) => {
          selectPath(path);
        }}
      />
    </Box>
  );
}
