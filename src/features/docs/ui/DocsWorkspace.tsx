"use client";

import * as React from "react";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { Alert, AppBar, Box, Button, CircularProgress, Container, Divider, Drawer, Paper, Snackbar, Stack, Tab, Tabs, Toolbar, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createStandaloneChat } from "@/features/chat/services/chatClient";
import { parseLocationAnchor, stripPathAnchor } from "@/features/docs/domain/anchor";
import { isPrDocsPath } from "@/features/docs/domain/pathAliases";
import { isPathWithinScope, normalizeDocsRouteState, type DocsNodeType } from "@/features/docs/domain/urlState";
import type { DocStarUpdate, PathMetaPayload } from "@/features/docs/domain/types";
import { DocPreview } from "@/features/docs/ui/DocPreview";
import { DocsStarredList } from "@/features/docs/ui/DocsStarredList";
import { DocsTree } from "@/features/docs/ui/DocsTree";
import type { PrFileStarUpdate } from "@/features/reviews/domain/types";
import { ReviewDrawer } from "@/features/reviews/ui/ReviewDrawer";

const DOCS_DRAWER_WIDTH = 320;
const REVIEW_DRAWER_WIDTH = 360;
const APP_HEADER_HEIGHT = 64;
const DocumentChatDialog = dynamic(() => import("@/features/chat/ui/DocumentChatDialog"), { ssr: false });
type DocsDrawerTab = "tree" | "starred";
type ResolvedPathMeta = {
  path: string;
  nodeType: DocsNodeType;
};

export function DocsWorkspace(): React.JSX.Element {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  const isLgUp = useMediaQuery(theme.breakpoints.up("lg"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const rawPathParam = searchParams.get("path") ?? "";
  const rawScopeParam = searchParams.get("scope") ?? "";
  const pathParam = React.useMemo(() => stripPathAnchor(rawPathParam), [rawPathParam]);
  const scopeParam = React.useMemo(() => stripPathAnchor(rawScopeParam), [rawScopeParam]);

  const [selectedPath, setSelectedPath] = React.useState("");
  const [scopePath, setScopePath] = React.useState("");
  const [location, setLocation] = React.useState<{ line?: number; heading?: string }>({});
  const [docsDrawerOpen, setDocsDrawerOpen] = React.useState(false);
  const [docsDrawerTab, setDocsDrawerTab] = React.useState<DocsDrawerTab>("tree");
  const [reviewDrawerOpen, setReviewDrawerOpen] = React.useState(false);
  const [chatVisible, setChatVisible] = React.useState(false);
  const [standaloneChatConversationId, setStandaloneChatConversationId] = React.useState<string | null>(null);
  const [isCreatingStandaloneChat, setIsCreatingStandaloneChat] = React.useState(false);
  const [standaloneChatCreateError, setStandaloneChatCreateError] = React.useState<string | null>(null);
  const [docStarRefreshToken, setDocStarRefreshToken] = React.useState(0);
  const [latestDocStarUpdate, setLatestDocStarUpdate] = React.useState<DocStarUpdate | null>(null);
  const [latestPrStarUpdate, setLatestPrStarUpdate] = React.useState<PrFileStarUpdate | null>(null);
  const pathTypeCacheRef = React.useRef<Map<string, ResolvedPathMeta>>(new Map());
  const latestReadPath = React.useRef("");
  const createChatInFlightRef = React.useRef(false);
  const createChatControllerRef = React.useRef<AbortController | null>(null);
  const newChatButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const focusRestoreFrameRef = React.useRef<number | null>(null);
  const appBarRef = React.useRef<HTMLElement | null>(null);
  const [appHeaderHeight, setAppHeaderHeight] = React.useState(APP_HEADER_HEIGHT);
  const anyChatVisible = chatVisible || Boolean(standaloneChatConversationId);

  React.useEffect(() => () => {
    createChatControllerRef.current?.abort();
  }, []);

  React.useEffect(() => () => {
    if (focusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreFrameRef.current);
    }
  }, []);

  React.useEffect(() => {
    const appBar = appBarRef.current;
    if (!appBar) {
      return;
    }

    const updateHeaderHeight = () => {
      setAppHeaderHeight(Math.ceil(appBar.getBoundingClientRect().height));
    };
    updateHeaderHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateHeaderHeight);
      observer.observe(appBar);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateHeaderHeight);
    return () => window.removeEventListener("resize", updateHeaderHeight);
  }, []);

  const handleCreateStandaloneChat = React.useCallback(async () => {
    if (createChatInFlightRef.current) {
      return;
    }

    createChatInFlightRef.current = true;
    const controller = new AbortController();
    createChatControllerRef.current = controller;
    setIsCreatingStandaloneChat(true);
    setStandaloneChatCreateError(null);

    try {
      const history = await createStandaloneChat({ signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      if (!history.conversationId) {
        throw new Error("missing conversation id");
      }
      setStandaloneChatConversationId(history.conversationId);
    } catch {
      if (!controller.signal.aborted) {
        setStandaloneChatCreateError("新建聊天失败，请稍后重试。");
      }
    } finally {
      if (createChatControllerRef.current === controller) {
        createChatControllerRef.current = null;
      }
      createChatInFlightRef.current = false;
      if (!controller.signal.aborted) {
        setIsCreatingStandaloneChat(false);
      }
    }
  }, []);

  const handleCloseStandaloneChat = React.useCallback(() => {
    setStandaloneChatConversationId(null);
    if (focusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreFrameRef.current);
    }
    focusRestoreFrameRef.current = window.requestAnimationFrame(() => {
      focusRestoreFrameRef.current = null;
      newChatButtonRef.current?.focus();
    });
  }, []);

  const getPathMeta = React.useCallback(async (path: string, signal: AbortSignal): Promise<ResolvedPathMeta | null> => {
    const cached = pathTypeCacheRef.current.get(path);
    if (cached) {
      return cached;
    }

    const response = await fetch(`/api/docs/meta?path=${encodeURIComponent(path)}`, {
      signal
    });
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        return null;
      }
      throw new Error("加载路径信息失败");
    }

    const payload = (await response.json()) as PathMetaPayload;
    const resolved = {
      path: payload.path,
      nodeType: payload.nodeType
    };
    pathTypeCacheRef.current.set(path, resolved);
    pathTypeCacheRef.current.set(payload.path, resolved);
    return {
      path: payload.path,
      nodeType: payload.nodeType
    };
  }, []);

  React.useEffect(() => {
    if (!pathParam) {
      setSelectedPath("");
    }

    const cachedPathNodeType = pathParam ? pathTypeCacheRef.current.get(pathParam)?.nodeType : undefined;
    const canUseOptimisticPath =
      Boolean(pathParam) &&
      cachedPathNodeType === "file" &&
      (!scopeParam || pathParam === scopeParam || isPathWithinScope(pathParam, scopeParam));

    if (canUseOptimisticPath) {
      setSelectedPath(pathParam);
    } else if (!scopeParam && pathParam) {
      setSelectedPath("");
    }

    let cancelled = false;
    const controller = new AbortController();

    const resolveRouteParams = async () => {
      let scopeNodeType: DocsNodeType | null | undefined;
      let pathNodeType: DocsNodeType | null | undefined;
      let resolvedScopeParam = scopeParam;
      let resolvedPathParam = pathParam;

      if (scopeParam) {
        try {
          const scopeMeta = await getPathMeta(scopeParam, controller.signal);
          scopeNodeType = scopeMeta?.nodeType ?? null;
          resolvedScopeParam = scopeMeta?.path ?? "";
        } catch {
          scopeNodeType = undefined;
        }
      }

      if (pathParam) {
        try {
          const pathMeta = await getPathMeta(pathParam, controller.signal);
          pathNodeType = pathMeta?.nodeType ?? null;
          resolvedPathParam = pathMeta?.path ?? "";
        } catch {
          pathNodeType = undefined;
        }
      }

      const normalized = normalizeDocsRouteState({
        scopePath: resolvedScopeParam,
        path: resolvedPathParam,
        scopeNodeType,
        pathNodeType
      });

      if (cancelled) {
        return;
      }

      setScopePath(normalized.scopePath);
      setSelectedPath(normalized.path);

      const nextParams = new URLSearchParams(searchParamsString);
      if (normalized.scopePath) {
        nextParams.set("scope", normalized.scopePath);
      } else {
        nextParams.delete("scope");
      }

      if (normalized.path) {
        nextParams.set("path", normalized.path);
      } else {
        nextParams.delete("path");
      }

      if (nextParams.toString() !== searchParamsString) {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const nextUrl = nextParams.toString() ? `/docs?${nextParams.toString()}` : "/docs";
        router.replace(`${nextUrl}${hash}`);
      }
    };

    void resolveRouteParams();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [getPathMeta, pathParam, router, scopeParam, searchParamsString]);

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
      const params = new URLSearchParams(searchParamsString);

      const safeScope = stripPathAnchor(params.get("scope") ?? "");
      if (safeScope && safePath && !isPathWithinScope(safePath, safeScope)) {
        params.delete("scope");
        setScopePath("");
      }

      if (safePath) {
        pathTypeCacheRef.current.set(safePath, { path: safePath, nodeType: "file" });
        params.set("path", safePath);
      } else {
        params.delete("path");
      }

      const nextUrl = params.toString() ? `/docs?${params.toString()}` : "/docs";
      const hash = line ? `#L${line}` : "";

      router.replace(`${nextUrl}${hash}`);
      setSelectedPath(safePath);
      setLocation(line ? { line } : {});

      if (!isMdUp) {
        setDocsDrawerOpen(false);
      }
    },
    [isMdUp, router, searchParamsString]
  );

  const handleDocStarChanged = React.useCallback((path: string, isStarred: boolean, starredAt?: string | null) => {
    setDocStarRefreshToken((prev) => prev + 1);
    setLatestDocStarUpdate({
      path,
      isStarred,
      starredAt: isStarred ? starredAt ?? new Date().toISOString() : null
    });
    if (isPrDocsPath(path)) {
      setLatestPrStarUpdate({
        path,
        isStarred,
        starredAt: isStarred ? starredAt ?? new Date().toISOString() : null
      });
    }
  }, []);

  const handlePreviewNavigate = React.useCallback(
    (path: string) => {
      selectPath(path);
    },
    [selectPath]
  );

  const handlePreviewLoaded = React.useCallback(async (path: string) => {
    pathTypeCacheRef.current.set(path, { path, nodeType: "file" });
    if (!isPrDocsPath(path) || latestReadPath.current === path) {
      return;
    }

    latestReadPath.current = path;
    try {
      await fetch("/api/reviews/pr-files/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, isRead: true })
      });
    } catch {
      // Ignore mark-read failures to avoid blocking preview rendering.
    }
  }, []);

  const handlePreviewStarChanged = React.useCallback(
    (path: string, isStarred: boolean, starredAt?: string | null) => {
      handleDocStarChanged(path, isStarred, starredAt);
    },
    [handleDocStarChanged]
  );

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <AppBar
        ref={appBarRef}
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
        <Toolbar sx={{ minHeight: `${APP_HEADER_HEIGHT}px !important`, px: { xs: 1, md: 1.5 }, py: { xs: 0.75, md: 0 } }}>
          <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "stretch", md: "center" }} justifyContent="space-between" width="100%" gap={{ xs: 0.5, md: 1 }} sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={1.2} sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={800} letterSpacing="-0.02em">
                DocLens
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }}>
                Docs 浏览 + 搜索 + 审阅工作台
              </Typography>
            </Stack>

            <Stack direction="row" gap={{ xs: 0.5, sm: 1 }} flexWrap="wrap" sx={{ minWidth: 0 }}>
              <Button
                ref={newChatButtonRef}
                size="small"
                variant="outlined"
                startIcon={isCreatingStandaloneChat ? <CircularProgress size={14} color="inherit" /> : <AddCommentOutlinedIcon />}
                onClick={() => void handleCreateStandaloneChat()}
                disabled={isCreatingStandaloneChat}
                aria-haspopup="dialog"
                sx={{ minHeight: 44, whiteSpace: "nowrap" }}
              >
                {isCreatingStandaloneChat ? "正在创建…" : "新建聊天"}
              </Button>
              <Button
                size="small"
                variant={docsDrawerOpen ? "contained" : "outlined"}
                startIcon={<MenuBookOutlinedIcon />}
                onClick={() => setDocsDrawerOpen((prev) => !prev)}
              >
                {docsDrawerOpen ? "收起目录" : "展开目录"}
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
        open={docsDrawerOpen && !anyChatVisible}
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
            top: appHeaderHeight,
            height: `calc(100dvh - ${appHeaderHeight}px)`,
            display: "flex",
            flexDirection: "column"
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
        <Tabs
          value={docsDrawerTab}
          onChange={(_, value: DocsDrawerTab) => {
            setDocsDrawerTab(value);
          }}
          variant="fullWidth"
          sx={{ minHeight: 40, mb: 1 }}
        >
          <Tab value="tree" label="目录树" sx={{ minHeight: 40, textTransform: "none", fontWeight: 600 }} />
          <Tab value="starred" label="星标文档" sx={{ minHeight: 40, textTransform: "none", fontWeight: 600 }} />
        </Tabs>
        {docsDrawerTab === "tree" ? (
          <DocsTree
            selectedPath={selectedPath}
            scopePath={scopePath}
            onSelectFile={(path) => {
              selectPath(path);
            }}
          />
        ) : (
          <DocsStarredList
            selectedPath={selectedPath}
            scopePath={scopePath}
            refreshToken={docStarRefreshToken}
            onSelectFile={(path) => {
              selectPath(path);
            }}
            onStarChanged={(path, isStarred) => {
              handleDocStarChanged(path, isStarred);
            }}
          />
        )}
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
              externalStarUpdate={latestDocStarUpdate}
              onNavigatePath={handlePreviewNavigate}
              onLoaded={handlePreviewLoaded}
              onStarChanged={handlePreviewStarChanged}
              onChatOpenChange={setChatVisible}
            />
          </Paper>
        </Stack>
      </Container>

      <ReviewDrawer
        open={reviewDrawerOpen && !anyChatVisible}
        onOpenChange={setReviewDrawerOpen}
        appHeaderHeight={appHeaderHeight}
        selectedPath={selectedPath}
        externalStarUpdate={latestPrStarUpdate}
        onOpenFile={(path) => {
          selectPath(path);
        }}
        onStarChanged={(path, isStarred, starredAt) => {
          handleDocStarChanged(path, isStarred, starredAt);
        }}
      />

      {standaloneChatConversationId ? (
        <DocumentChatDialog
          key={`standalone:${standaloneChatConversationId}`}
          open
          path=""
          displayPath=""
          conversationId={standaloneChatConversationId}
          onClose={handleCloseStandaloneChat}
        />
      ) : null}

      <Snackbar
        open={Boolean(standaloneChatCreateError)}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() => setStandaloneChatCreateError(null)}
      >
        <Alert severity="error" variant="filled" role="alert" onClose={() => setStandaloneChatCreateError(null)}>
          {standaloneChatCreateError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
