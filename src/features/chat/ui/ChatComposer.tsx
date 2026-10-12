"use client";

import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { Box, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MAX_QUESTION_CHARS } from "@/features/chat/domain/types";

export type ChatComposerProps = {
  onSend: (content: string) => boolean | void;
  isStreaming: boolean;
  onStop: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  inputLabel?: string;
};

export function ChatComposer({
  onSend,
  isStreaming,
  onStop,
  disabled = false,
  autoFocus = false,
  placeholder = "询问这份文档…",
  inputLabel = "询问这份文档"
}: ChatComposerProps): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const hintId = useId();
  const countId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isOverLimit = draft.length > MAX_QUESTION_CHARS;
  const canSend = draft.trim().length > 0 && !isOverLimit && !disabled && !isStreaming;

  useEffect(() => {
    if (!autoFocus || disabled) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, disabled]);

  const sendDraft = useCallback(() => {
    const content = draft.trim();
    if (!content || content.length > MAX_QUESTION_CHARS || disabled || isStreaming) return;

    const accepted = onSend(content);
    if (accepted === false) return;

    setDraft("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [disabled, draft, isStreaming, onSend]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const nativeEvent = event.nativeEvent;
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    if (event.repeat) return;
    sendDraft();
  };

  return (
    <Stack spacing={0.75} sx={{ width: "100%", minWidth: 0 }}>
      <Paper
        variant="outlined"
        sx={{
          minWidth: 0,
          p: 1.25,
          borderRadius: 3,
          transition: "border-color 160ms ease, box-shadow 160ms ease",
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}22`
          }
        }}
      >
        <TextField
          fullWidth
          multiline
          minRows={1}
          maxRows={6}
          autoFocus={autoFocus && !disabled}
          value={draft}
          disabled={disabled}
          error={isOverLimit}
          inputRef={inputRef}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          inputProps={{
            "aria-label": inputLabel,
            "aria-describedby": `${hintId} ${countId}`
          }}
          variant="standard"
          InputProps={{ disableUnderline: true }}
          sx={{
            minWidth: 0,
            "& .MuiInputBase-root": {
              alignItems: "flex-end",
              fontSize: 16,
              lineHeight: 1.55,
              py: 0
            },
            "& .MuiInputBase-input": {
              minWidth: 0,
              p: 0,
              overflowY: "auto"
            },
            "& .MuiInputBase-input::placeholder": {
              opacity: 1,
              color: "text.secondary"
            }
          }}
        />

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ mt: 1, minWidth: 0 }}
        >
          <Typography
            id={hintId}
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 0, fontSize: { xs: 11, sm: 12 }, lineHeight: 1.4 }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Enter 发送 · Shift + Enter 换行
            </Box>
            <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
              Enter发送 · Shift+Enter换行
            </Box>
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            <Typography
              id={countId}
              variant="caption"
              color={isOverLimit ? "error.main" : "text.secondary"}
              aria-live={isOverLimit ? "polite" : undefined}
              sx={{ fontSize: 12, whiteSpace: "nowrap" }}
            >
              {isOverLimit
                ? `超出 ${draft.length - MAX_QUESTION_CHARS} 个字符`
                : `${draft.length} / ${MAX_QUESTION_CHARS}`}
            </Typography>

            {isStreaming ? (
              <IconButton
                aria-label="停止生成"
                title="停止生成"
                color="primary"
                disabled={disabled}
                onClick={onStop}
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 2,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.dark" },
                  "&.Mui-disabled": {
                    bgcolor: "action.disabledBackground",
                    color: "action.disabled"
                  }
                }}
              >
                <StopRoundedIcon />
              </IconButton>
            ) : (
              <IconButton
                aria-label="发送消息"
                title="发送消息"
                color="primary"
                disabled={!canSend}
                onClick={sendDraft}
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 2,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.dark" },
                  "&.Mui-disabled": {
                    bgcolor: "action.disabledBackground",
                    color: "action.disabled"
                  }
                }}
              >
                <ArrowUpwardRoundedIcon />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
