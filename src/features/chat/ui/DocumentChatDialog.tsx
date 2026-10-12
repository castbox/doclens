"use client";

import * as React from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useDocumentChat } from "@/features/chat/ui/useDocumentChat";
import { ChatComposer } from "@/features/chat/ui/ChatComposer";
import { ChatMessage as ChatMessageView } from "@/features/chat/ui/ChatMessage";

export default function DocumentChatDialog({
  open,
  path,
  displayPath,
  onClose
}: {
  open: boolean;
  path: string;
  displayPath: string;
  onClose: () => void;
}): React.JSX.Element {
  const {
    messages,
    isStreaming,
    isLoadingHistory,
    historyLoadFailed,
    hasMore,
    isLoadingEarlier,
    loadEarlierError,
    documentChanged,
    isGenerating,
    error,
    canRetry,
    send,
    stop,
    retry,
    loadEarlier
  } = useDocumentChat({ open, path });
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const earlierScrollAnchorRef = React.useRef<{
    path: string;
    messageCount: number;
    firstMessageId?: string;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const followsLatestRef = React.useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
  const pathParts = path.split(/[\\/]/).filter(Boolean);
  const documentName = pathParts[pathParts.length - 1] ?? path;
  const hasUserMessage = messages.some((message) => message.role === "user");
  const isPreparingSummary = open && !isLoadingHistory && messages.length === 0 && !error && !isGenerating;
  const isRemoteGenerating = isGenerating && !isStreaming && !error;
  const isComposerDisabled = historyLoadFailed || (!isStreaming && (isLoadingHistory || isGenerating || isPreparingSummary));
  const statusMessage = isLoadingHistory
    ? ""
    : isStreaming
      ? hasUserMessage ? "DeepSeek 正在生成回复…" : "正在阅读文档并整理摘要…"
      : isRemoteGenerating
        ? "此文档正在另一窗口生成回复…"
        : "";

  React.useLayoutEffect(() => {
    if (!open) {
      return;
    }

    followsLatestRef.current = true;
    setShowJumpToLatest(false);
    earlierScrollAnchorRef.current = null;
  }, [open, path]);

  React.useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!open || !container) {
      return;
    }

    const anchor = earlierScrollAnchorRef.current;
    if (anchor && anchor.path === path) {
      const hasPrependedMessages =
        messages.length > anchor.messageCount && messages[0]?.id !== anchor.firstMessageId;
      if (hasPrependedMessages) {
        const addedHeight = container.scrollHeight - anchor.scrollHeight;
        container.scrollTop = anchor.scrollTop + addedHeight;
        earlierScrollAnchorRef.current = null;
        const isNearLatest = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
        followsLatestRef.current = isNearLatest;
        setShowJumpToLatest(!isNearLatest);
        return;
      }

      if (!isLoadingEarlier && messages.length <= anchor.messageCount) {
        earlierScrollAnchorRef.current = null;
      }
    }

    if (!followsLatestRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages, isStreaming, isLoadingHistory, isLoadingEarlier, open, path]);

  const handleScroll = React.useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const isNearLatest = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    followsLatestRef.current = isNearLatest;
    setShowJumpToLatest(!isNearLatest);
    if (earlierScrollAnchorRef.current) {
      earlierScrollAnchorRef.current.scrollHeight = container.scrollHeight;
      earlierScrollAnchorRef.current.scrollTop = container.scrollTop;
    }
  }, []);

  const handleLoadEarlier = React.useCallback(() => {
    const container = scrollRef.current;
    if (!container || !hasMore || isLoadingEarlier) {
      return;
    }

    earlierScrollAnchorRef.current = {
      path,
      messageCount: messages.length,
      firstMessageId: messages[0]?.id,
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop
    };
    loadEarlier();
  }, [hasMore, isLoadingEarlier, loadEarlier, messages, path]);

  const jumpToLatest = React.useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    followsLatestRef.current = true;
    setShowJumpToLatest(false);
    container.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  }, [prefersReducedMotion]);

  const handleSend = React.useCallback((content: string) => {
    followsLatestRef.current = true;
    setShowJumpToLatest(false);
    return send(content);
  }, [send]);

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      aria-labelledby="document-chat-title"
      TransitionProps={{ timeout: prefersReducedMotion ? 0 : undefined }}
      PaperProps={{
        sx: {
          height: "100vh",
          "@supports (height: 100dvh)": { height: "100dvh" },
          width: "100vw",
          maxWidth: "none",
          maxHeight: "none",
          m: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: 0,
          borderRadius: 0,
          bgcolor: "background.paper",
          "@media (prefers-reduced-motion: reduce)": {
            "&, & *": {
              scrollBehavior: "auto !important",
              animationDuration: "0.01ms !important",
              transitionDuration: "0.01ms !important"
            }
          }
        }
      }}
    >
      <Box
        component="header"
        sx={{
          flex: "0 0 auto",
          minWidth: 0,
          px: { xs: 1.5, sm: 2.5 },
          pt: "calc(env(safe-area-inset-top, 0px) + 10px)",
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper"
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography id="document-chat-title" component="h1" variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                文档对话
              </Typography>
              <Chip label="DeepSeek" size="small" variant="outlined" color="primary" />
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0, sm: 1 }}
              alignItems={{ xs: "flex-start", sm: "baseline" }}
              sx={{ minWidth: 0, mt: 0.35 }}
            >
              <Typography variant="body2" noWrap title={documentName} sx={{ minWidth: 0, maxWidth: { xs: "100%", sm: "42%" }, fontWeight: 600 }}>
                {documentName}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                title={displayPath}
                sx={{ minWidth: 0, maxWidth: "100%", flex: 1, lineHeight: 1.35 }}
              >
                {displayPath}
              </Typography>
            </Stack>
          </Box>
          <Tooltip title="关闭文档对话">
            <IconButton
              aria-label="关闭文档对话"
              onClick={onClose}
              sx={{ width: 44, height: 44, flex: "0 0 auto", color: "text.secondary" }}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Box component="main" sx={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, position: "relative", overflow: "hidden" }}>
        <Box
          ref={scrollRef}
          role="log"
          aria-label="文档聊天记录"
          aria-live="off"
          onScroll={handleScroll}
          sx={{
            height: "100%",
            width: "100%",
            minWidth: 0,
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
            WebkitOverflowScrolling: "touch",
            overflowAnchor: "none"
          }}
        >
          {isLoadingHistory ? (
            <Stack
              role="status"
              aria-live="polite"
              alignItems="center"
              justifyContent="center"
              spacing={1.25}
              sx={{ minHeight: "100%", px: 2, color: "text.secondary" }}
            >
              <CircularProgress size={24} aria-label="正在恢复聊天记录" />
              <Typography variant="body2">正在恢复聊天记录…</Typography>
            </Stack>
          ) : isPreparingSummary ? (
            <Stack
              role="status"
              aria-live="polite"
              alignItems="center"
              justifyContent="center"
              spacing={1.25}
              sx={{ minHeight: "100%", px: 2, color: "text.secondary" }}
            >
              <CircularProgress size={24} aria-label="正在读取文档" />
              <Typography variant="body2">正在阅读文档并生成简明摘要…</Typography>
            </Stack>
          ) : (
            <Stack
              spacing={{ xs: 2, sm: 2.5 }}
              sx={{
                width: "100%",
                minWidth: 0,
                minHeight: messages.length === 0 ? "100%" : undefined,
                justifyContent: messages.length === 0 ? "center" : undefined,
                px: { xs: 1.5, sm: 3, lg: 5 },
                py: { xs: 2, sm: 3 }
              }}
            >
              {loadEarlierError ? (
                <Alert
                  severity="error"
                  variant="outlined"
                  sx={{ width: "100%", minWidth: 0, py: 0.25, overflowWrap: "anywhere" }}
                >
                  {loadEarlierError}
                </Alert>
              ) : null}
              {hasMore || loadEarlierError ? (
                <Box sx={{ display: "flex", justifyContent: "center", minWidth: 0 }}>
                  <Button
                    size="small"
                    variant="text"
                    disabled={isLoadingEarlier}
                    onClick={handleLoadEarlier}
                    startIcon={isLoadingEarlier ? <CircularProgress size={14} color="inherit" /> : undefined}
                    sx={{ minHeight: 44, maxWidth: "100%" }}
                  >
                    {isLoadingEarlier
                      ? "正在加载更早的对话…"
                      : loadEarlierError ? "重试加载更早记录" : "加载更早的对话"}
                  </Button>
                </Box>
              ) : null}
              {documentChanged ? (
                <Alert
                  severity="info"
                  variant="outlined"
                  sx={{ width: "100%", minWidth: 0, py: 0.25, overflowWrap: "anywhere" }}
                >
                  文档已有更新，历史记录已保留，后续问题将参考当前内容。
                </Alert>
              ) : null}
              {messages.map((message, index) => (
                <ChatMessageView
                  key={message.id}
                  message={message}
                  isStreaming={isStreaming && index === messages.length - 1 && message.role === "assistant"}
                />
              ))}
              {statusMessage ? (
                <Stack direction="row" spacing={1} alignItems="center" role="status" aria-live="polite" aria-atomic="true" sx={{ color: "text.secondary", py: 0.25 }}>
                  <CircularProgress size={14} aria-hidden="true" />
                  <Typography variant="caption">{statusMessage}</Typography>
                </Stack>
              ) : null}
            </Stack>
          )}
        </Box>

        {showJumpToLatest ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<KeyboardArrowDownRoundedIcon />}
            onClick={jumpToLatest}
            sx={{
              position: "absolute",
              right: { xs: 12, sm: 20 },
              bottom: 12,
              minHeight: 44,
              bgcolor: "background.paper",
              boxShadow: "0 2px 8px rgba(15,23,42,0.12)"
            }}
          >
            回到底部
          </Button>
        ) : null}
      </Box>

      <Box
        component="footer"
        sx={{
          flex: "0 0 auto",
          minWidth: 0,
          px: { xs: 1.25, sm: 2.5 },
          pt: 1.5,
          pb: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper"
        }}
      >
        {error ? (
          <Alert
            severity="error"
            role="alert"
            action={canRetry ? (
              <Button color="inherit" size="small" onClick={retry} sx={{ minHeight: 44, whiteSpace: "nowrap" }}>
                重试
              </Button>
            ) : undefined}
            sx={{ mb: 1.25, alignItems: "center", minWidth: 0, overflowWrap: "anywhere" }}
          >
            {error}
          </Alert>
        ) : null}
        <ChatComposer
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={stop}
          disabled={isComposerDisabled}
          autoFocus={open}
        />
        <Typography
          component="p"
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.75, mb: 0, textAlign: "center", lineHeight: 1.45 }}
        >
          历史记录完整保存，回答参考当前文档与最近对话。
        </Typography>
      </Box>
    </Dialog>
  );
}
