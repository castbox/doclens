"use client";

import * as React from "react";
import SearchIcon from "@mui/icons-material/Search";
import { AppBar, Box, Button, Container, Grid, Paper, Stack, Toolbar, Typography } from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseLocationAnchor } from "@/features/docs/domain/anchor";
import { DocPreview } from "@/features/docs/ui/DocPreview";
import { DocsTree } from "@/features/docs/ui/DocsTree";
import { SearchPanel } from "@/features/search/ui/SearchPanel";
import { ReviewDrawer } from "@/features/reviews/ui/ReviewDrawer";

export function DocsWorkspace(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathParam = searchParams.get("path") ?? "";

  const [selectedPath, setSelectedPath] = React.useState(pathParam);
  const [location, setLocation] = React.useState<{ line?: number; heading?: string }>({});
  const [showSearch, setShowSearch] = React.useState(true);

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
    },
    [router, searchParams]
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

      <Container maxWidth={false} sx={{ py: 1.25, px: { xs: 1, md: 1.5 }, pr: { lg: "380px" } }}>
        <Grid container spacing={1.25}>
          <Grid item xs={12}>
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
          </Grid>

          <Grid item xs={12} md={3} lg={2.8}>
            <Paper variant="outlined" sx={{ p: 1, minHeight: "78vh", maxHeight: "78vh", overflow: "hidden" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                Docs 目录
              </Typography>
              <DocsTree
                selectedPath={selectedPath}
                onSelectFile={(path) => {
                  selectPath(path);
                }}
              />
            </Paper>
          </Grid>

          <Grid item xs={12} md={9} lg={9.2}>
            <Paper variant="outlined" sx={{ p: { xs: 1, md: 1.25 }, minHeight: "78vh", overflow: "auto" }}>
              <DocPreview
                path={selectedPath}
                location={location}
                onNavigatePath={(path) => {
                  selectPath(path);
                }}
              />
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <ReviewDrawer docPath={selectedPath} />
    </Box>
  );
}
