import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatClientError,
  loadDocumentChatHistory,
  streamDocumentChat
} from "../services/chatClient";
import {
  MAX_QUESTION_CHARS,
  type ChatHistoryPayload,
  type ChatMessage,
  type DocumentChatRequest
} from "../domain/types";

const STRICT_MODE_SETUP_DELAY_MS = 50;
const REMOTE_GENERATION_POLL_MS = 1_500;
const STOPPED_MESSAGE = "已停止生成。正在同步已保存的聊天记录。";
const LOAD_HISTORY_ERROR = "无法读取聊天记录，请点击重试加载。";
const LOAD_EARLIER_ERROR = "无法读取更早的聊天记录，请重试。";

type DocumentChatSession = {
  id: number;
  path: string;
};

type RenderedSession = {
  open: boolean;
  path: string;
};

type ReadHistoryOptions = {
  showLoading?: boolean;
  preserveError?: boolean;
  autoStartSummary?: boolean;
  pollOnFailure?: boolean;
};

type ReadHistory = (sessionId: number, options?: ReadHistoryOptions) => Promise<ChatHistoryPayload | null>;

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "聊天请求失败，请稍后重试。";
}

function latestRetryableAssistant(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    return message.status === "stopped" || message.status === "error" ? message : null;
  }

  return null;
}

function retryMessageError(message: ChatMessage): string {
  if (message.error?.trim()) {
    return message.error;
  }

  return message.status === "stopped"
    ? "上一条回答已停止，可以重试。"
    : "上一条回答生成失败，可以重试。";
}

function mergeLatestMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = current.slice();
  const positions = new Map(merged.map((message, index) => [message.id, index]));

  for (const message of incoming) {
    const index = positions.get(message.id);
    if (index === undefined) {
      positions.set(message.id, merged.length);
      merged.push(message);
    } else {
      merged[index] = message;
    }
  }

  return merged;
}

function mergeEarlierMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const olderIds = new Set(incoming.map((message) => message.id));
  return [
    ...incoming,
    ...current.filter((message) => !olderIds.has(message.id))
  ];
}

export type UseDocumentChatOptions = {
  open: boolean;
  path: string;
};

export type UseDocumentChatResult = {
  messages: ChatMessage[];
  isLoadingHistory: boolean;
  historyLoadFailed: boolean;
  isLoadingEarlier: boolean;
  loadEarlierError: string | null;
  hasMore: boolean;
  isStreaming: boolean;
  isGenerating: boolean;
  documentChanged: boolean;
  error: string | null;
  canRetry: boolean;
  send: (content: string) => boolean;
  stop: () => void;
  retry: () => void;
  loadEarlier: () => void;
};

export function useDocumentChat({ open, path }: UseDocumentChatOptions): UseDocumentChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(open);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [loadEarlierError, setLoadEarlierError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [documentChanged, setDocumentChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  const historyRef = useRef<ChatHistoryPayload | null>(null);
  const sessionRef = useRef<DocumentChatSession | null>(null);
  const renderedSessionRef = useRef<RenderedSession>({ open, path });
  const historySessionIdRef = useRef<number | null>(null);
  const sessionSequenceRef = useRef(0);
  const historySequenceRef = useRef(0);
  const streamSequenceRef = useRef(0);
  const earlierSequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const earlierControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollHistoryRef = useRef<(sessionId: number) => void>(() => undefined);
  const readHistoryRef = useRef<ReadHistory | null>(null);
  const historyLoadedRef = useRef(false);
  const historyLoadFailedRef = useRef(false);
  const isLoadingHistoryRef = useRef(false);
  const isLoadingEarlierRef = useRef(false);
  const hasMoreRef = useRef(false);
  const loadedEarlierRef = useRef(false);
  const isStreamingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const summaryStartedRef = useRef(false);
  const errorRef = useRef<string | null>(null);

  // Track current props during render so callbacks from an old path are ignored
  // before React runs the previous effect's cleanup.
  renderedSessionRef.current = { open, path };

  const setCurrentError = useCallback((value: string | null) => {
    errorRef.current = value;
    setError(value);
  }, []);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const isCurrentSession = useCallback((sessionId: number): boolean => {
    const session = sessionRef.current;
    const rendered = renderedSessionRef.current;
    return Boolean(session && session.id === sessionId && rendered.open && rendered.path === session.path);
  }, []);

  const applyHistory = useCallback(
    (
      sessionId: number,
      payload: ChatHistoryPayload,
      { preserveError = false, page = "latest" }: { preserveError?: boolean; page?: "latest" | "earlier" } = {}
    ) => {
      if (!isCurrentSession(sessionId)) {
        return;
      }

      const nextMessages = page === "earlier"
        ? mergeEarlierMessages(messagesRef.current, payload.messages)
        : mergeLatestMessages(messagesRef.current, payload.messages);
      messagesRef.current = nextMessages;
      historySessionIdRef.current = sessionId;
      historyLoadedRef.current = true;

      if (page === "latest") {
        historyLoadFailedRef.current = false;
        isGeneratingRef.current = payload.isGenerating;
        if (payload.messages.length > 0 || payload.isGenerating) {
          summaryStartedRef.current = true;
        }
        historyRef.current = payload;
        if (!loadedEarlierRef.current) {
          hasMoreRef.current = payload.hasMore;
          setHasMore(payload.hasMore);
        }
      } else {
        loadedEarlierRef.current = true;
        hasMoreRef.current = payload.hasMore;
        setHasMore(payload.hasMore);
      }

      setMessages(nextMessages);
      const currentGeneration = page === "latest" ? payload.isGenerating : isGeneratingRef.current;
      if (page === "latest") {
        setIsGenerating(payload.isGenerating);
        setDocumentChanged(payload.documentChanged);
      }

      if (currentGeneration) {
        setCurrentError(null);
        return;
      }

      const retryable = latestRetryableAssistant(nextMessages);
      if (retryable) {
        if (!preserveError || !errorRef.current) {
          setCurrentError(retryMessageError(retryable));
        }
      } else if (!preserveError) {
        setCurrentError(null);
      }
    },
    [isCurrentSession, setCurrentError]
  );

  const schedulePoll = useCallback(
    (sessionId: number) => {
      clearPollTimer();
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null;
        pollHistoryRef.current(sessionId);
      }, REMOTE_GENERATION_POLL_MS);
    },
    [clearPollTimer]
  );

  const startStream = useCallback(
    (sessionId: number, request: DocumentChatRequest): boolean => {
      const session = sessionRef.current;
      if (
        !session ||
        !isCurrentSession(sessionId) ||
        isLoadingHistoryRef.current ||
        isStreamingRef.current ||
        isGeneratingRef.current
      ) {
        return false;
      }

      clearPollTimer();
      const streamId = ++streamSequenceRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      isStreamingRef.current = true;
      setIsStreaming(true);
      setCurrentError(null);

      const isCurrentStream = () =>
        isCurrentSession(sessionId) && streamSequenceRef.current === streamId && !controller.signal.aborted;

      void streamDocumentChat(request, {
        signal: controller.signal,
        onHistory: (payload) => {
          if (!isCurrentStream()) {
            return;
          }
          applyHistory(sessionId, payload);
        },
        onDelta: (delta, messageId) => {
          if (!isCurrentStream() || !delta) {
            return;
          }

          const nextMessages = messagesRef.current.map((message) =>
            message.id === messageId && message.role === "assistant"
              ? { ...message, content: message.content + delta, status: "streaming" as const, error: null }
              : message
          );
          if (nextMessages.some((message, index) => message !== messagesRef.current[index])) {
            messagesRef.current = nextMessages;
            setMessages(nextMessages);
          }
        }
      })
        .then(() => {
          if (!isCurrentStream()) {
            return;
          }

          controllerRef.current = null;
          isStreamingRef.current = false;
          setIsStreaming(false);

          const latest = historyRef.current;
          const retryable = latest ? latestRetryableAssistant(messagesRef.current) : null;
          if (!latest?.isGenerating && !retryable) {
            setCurrentError(null);
          }
        })
        .catch((streamError: unknown) => {
          if (!isCurrentStream()) {
            return;
          }

          controllerRef.current = null;
          isStreamingRef.current = false;
          setIsStreaming(false);

          const conflict = streamError instanceof ChatClientError && streamError.status === 409;
          setCurrentError(conflict ? null : readableError(streamError));
          // Reconcile an uncertain/409 POST with GET only; never repeat a provider request.
          void readHistoryRef.current?.(sessionId, {
            showLoading: true,
            preserveError: !conflict,
            pollOnFailure: true
          });
        });

      return true;
    },
    [applyHistory, clearPollTimer, isCurrentSession, setCurrentError]
  );

  const startSummary = useCallback(
    (sessionId: number): boolean => {
      const session = sessionRef.current;
      if (
        !session ||
        !isCurrentSession(sessionId) ||
        !historyLoadedRef.current ||
        summaryStartedRef.current ||
        messagesRef.current.length > 0 ||
        isGeneratingRef.current
      ) {
        return false;
      }

      summaryStartedRef.current = true;
      return startStream(sessionId, { path: session.path, action: "summary" });
    },
    [isCurrentSession, startStream]
  );

  const readHistoryOnce = useCallback(
    async (
      sessionId: number,
      {
        showLoading = true,
        preserveError = false,
        autoStartSummary = false,
        pollOnFailure = false
      }: ReadHistoryOptions = {}
    ): Promise<ChatHistoryPayload | null> => {
      const session = sessionRef.current;
      if (!session || !isCurrentSession(sessionId)) {
        return null;
      }

      clearPollTimer();
      const readId = ++historySequenceRef.current;
      const controller = new AbortController();
      const previousController = controllerRef.current;
      previousController?.abort();
      controllerRef.current = controller;

      isLoadingHistoryRef.current = true;
      if (showLoading) {
        setIsLoadingHistory(true);
      }

      try {
        const payload = await loadDocumentChatHistory(session.path, { signal: controller.signal });
        if (
          !isCurrentSession(sessionId) ||
          historySequenceRef.current !== readId ||
          controller.signal.aborted
        ) {
          return null;
        }

        applyHistory(sessionId, payload, { preserveError });
        if (payload.isGenerating) {
          schedulePoll(sessionId);
        } else {
          clearPollTimer();
          if (
            autoStartSummary &&
            payload.messages.length === 0 &&
            !summaryStartedRef.current
          ) {
            // Allow startStream before the finally block so initial summary is not
            // rejected by the history-loading guard.
            if (showLoading) {
              isLoadingHistoryRef.current = false;
              setIsLoadingHistory(false);
            }
            startSummary(sessionId);
          }
        }
        return payload;
      } catch (historyError: unknown) {
        if (
          !isCurrentSession(sessionId) ||
          historySequenceRef.current !== readId ||
          controller.signal.aborted ||
          isAbortError(historyError)
        ) {
          return null;
        }

        historyLoadFailedRef.current = true;
        setCurrentError(LOAD_HISTORY_ERROR);
        if (pollOnFailure) {
          schedulePoll(sessionId);
        }
        return null;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        if (isCurrentSession(sessionId) && historySequenceRef.current === readId) {
          isLoadingHistoryRef.current = false;
          if (showLoading) {
            setIsLoadingHistory(false);
          }
        }
      }
    },
    [
      applyHistory,
      clearPollTimer,
      isCurrentSession,
      schedulePoll,
      setCurrentError,
      startSummary
    ]
  );

  readHistoryRef.current = readHistoryOnce;

  const pollHistory = useCallback(
    (sessionId: number) => {
      void readHistoryOnce(sessionId, { showLoading: false, pollOnFailure: true });
    },
    [readHistoryOnce]
  );
  pollHistoryRef.current = pollHistory;

  useEffect(() => {
    const sessionId = ++sessionSequenceRef.current;
    sessionRef.current = open ? { id: sessionId, path } : null;
    historyRef.current = null;
    historySessionIdRef.current = null;
    historyLoadedRef.current = false;
    historyLoadFailedRef.current = false;
    isLoadingHistoryRef.current = open;
    isLoadingEarlierRef.current = false;
    hasMoreRef.current = false;
    loadedEarlierRef.current = false;
    isStreamingRef.current = false;
    isGeneratingRef.current = false;
    summaryStartedRef.current = false;
    historySequenceRef.current += 1;
    streamSequenceRef.current += 1;
    earlierSequenceRef.current += 1;
    clearPollTimer();

    const oldController = controllerRef.current;
    controllerRef.current = null;
    oldController?.abort();
    const oldEarlierController = earlierControllerRef.current;
    earlierControllerRef.current = null;
    oldEarlierController?.abort();

    messagesRef.current = [];
    setMessages([]);
    setIsLoadingHistory(open);
    setIsLoadingEarlier(false);
    setLoadEarlierError(null);
    setHasMore(false);
    setIsStreaming(false);
    setIsGenerating(false);
    setDocumentChanged(false);
    setCurrentError(null);

    let beginTimer: ReturnType<typeof setTimeout> | null = null;
    if (open) {
      // StrictMode runs setup -> cleanup -> setup. Deferring GET gives the first
      // setup's timer a chance to be cancelled before any network request starts.
      beginTimer = setTimeout(() => {
        if (isCurrentSession(sessionId)) {
          void readHistoryOnce(sessionId, { showLoading: true, autoStartSummary: true });
        }
      }, STRICT_MODE_SETUP_DELAY_MS);
    }

    return () => {
      if (beginTimer !== null) {
        clearTimeout(beginTimer);
      }
      if (sessionRef.current?.id === sessionId) {
        sessionRef.current = null;
        historySequenceRef.current += 1;
        streamSequenceRef.current += 1;
        earlierSequenceRef.current += 1;
        clearPollTimer();
        const controller = controllerRef.current;
        controllerRef.current = null;
        controller?.abort();
        const earlierController = earlierControllerRef.current;
        earlierControllerRef.current = null;
        earlierController?.abort();
      }
    };
  }, [open, path, clearPollTimer, isCurrentSession, readHistoryOnce, setCurrentError]);

  const send = useCallback(
    (content: string): boolean => {
      const session = sessionRef.current;
      if (
        !session ||
        !isCurrentSession(session.id) ||
        !historyLoadedRef.current ||
        historyLoadFailedRef.current ||
        isLoadingHistoryRef.current ||
        isStreamingRef.current ||
        isGeneratingRef.current
      ) {
        return false;
      }

      const failedAssistant = latestRetryableAssistant(messagesRef.current);
      const canContinueFromPartial = failedAssistant?.status === "stopped" && Boolean(failedAssistant.content.trim());
      if (failedAssistant && !canContinueFromPartial) {
        if (!errorRef.current) {
          setCurrentError("请先重试上一条未完成的回答，再继续提问。");
        }
        return false;
      }

      const question = content.trim();
      if (!question) {
        return false;
      }
      if (question.length > MAX_QUESTION_CHARS) {
        setCurrentError(`每个问题不能超过 ${MAX_QUESTION_CHARS} 个字符。`);
        return false;
      }

      return startStream(session.id, { path: session.path, action: "send", content: question });
    },
    [isCurrentSession, setCurrentError, startStream]
  );

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !isCurrentSession(session.id) || !isStreamingRef.current) {
      return;
    }

    streamSequenceRef.current += 1;
    isStreamingRef.current = false;
    setIsStreaming(false);
    setCurrentError(STOPPED_MESSAGE);
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();

    // The service stores the partial answer on abort; fetch once to obtain its
    // durable status and server message id before exposing retry.
    void readHistoryRef.current?.(session.id, { showLoading: false, pollOnFailure: true });
  }, [isCurrentSession, setCurrentError]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    if (
      !session ||
      !isCurrentSession(session.id) ||
      isStreamingRef.current ||
      isLoadingHistoryRef.current ||
      isLoadingEarlierRef.current ||
      (isGeneratingRef.current && !historyLoadFailedRef.current)
    ) {
      return;
    }

    if (historyLoadFailedRef.current) {
      setCurrentError(null);
      void readHistoryRef.current?.(session.id, { showLoading: true, autoStartSummary: true });
      return;
    }

    const retryable = latestRetryableAssistant(messagesRef.current);
    if (!retryable || isGeneratingRef.current) {
      return;
    }

    startStream(session.id, {
      path: session.path,
      action: "retry",
      messageId: retryable.id
    });
  }, [isCurrentSession, setCurrentError, startStream]);

  const loadEarlier = useCallback(() => {
    const session = sessionRef.current;
    const firstMessage = messagesRef.current[0];
    if (
      !session ||
      !isCurrentSession(session.id) ||
      !historyLoadedRef.current ||
      !hasMoreRef.current ||
      !firstMessage ||
      isLoadingEarlierRef.current
    ) {
      return;
    }

    const requestId = ++earlierSequenceRef.current;
    const controller = new AbortController();
    earlierControllerRef.current = controller;
    isLoadingEarlierRef.current = true;
    setIsLoadingEarlier(true);
    setLoadEarlierError(null);

    void loadDocumentChatHistory(session.path, {
      signal: controller.signal,
      beforeMessageId: firstMessage.id
    })
      .then((payload) => {
        if (
          !isCurrentSession(session.id) ||
          earlierSequenceRef.current !== requestId ||
          controller.signal.aborted
        ) {
          return;
        }

        if (payload.messages.length === 0 && payload.hasMore) {
          setLoadEarlierError("没有找到更早的聊天记录。");
          return;
        }

        applyHistory(session.id, payload, { preserveError: true, page: "earlier" });
        setLoadEarlierError(null);
      })
      .catch((historyError: unknown) => {
        if (
          !isCurrentSession(session.id) ||
          earlierSequenceRef.current !== requestId ||
          controller.signal.aborted ||
          isAbortError(historyError)
        ) {
          return;
        }
        setLoadEarlierError(LOAD_EARLIER_ERROR);
      })
      .finally(() => {
        if (earlierControllerRef.current === controller) {
          earlierControllerRef.current = null;
        }
        if (isCurrentSession(session.id) && earlierSequenceRef.current === requestId) {
          isLoadingEarlierRef.current = false;
          setIsLoadingEarlier(false);
        }
      });
  }, [applyHistory, isCurrentSession]);

  const session = sessionRef.current;
  const sessionMatchesCurrentPath = Boolean(
    open && session && session.path === path && renderedSessionRef.current.path === session.path
  );
  const historyBelongsToSession = Boolean(
    sessionMatchesCurrentPath &&
      session &&
      historySessionIdRef.current === session.id &&
      historyLoadedRef.current
  );
  const visibleLoadingHistory = open && (
    (!historyBelongsToSession && !(sessionMatchesCurrentPath && historyLoadFailedRef.current)) || isLoadingHistory
  );
  const visibleMessages = historyBelongsToSession ? messages : [];
  const visibleIsStreaming = sessionMatchesCurrentPath && isStreaming;
  const visibleIsGenerating = historyBelongsToSession && isGenerating;
  const visibleDocumentChanged = historyBelongsToSession && documentChanged;
  const visibleError = sessionMatchesCurrentPath ? error : null;
  const canRetry = Boolean(
    visibleError &&
      !visibleIsStreaming &&
      !visibleLoadingHistory &&
      (historyLoadFailedRef.current || (!visibleIsGenerating && latestRetryableAssistant(visibleMessages)))
  );

  return {
    messages: visibleMessages,
    isLoadingHistory: visibleLoadingHistory,
    historyLoadFailed: sessionMatchesCurrentPath && historyLoadFailedRef.current,
    isLoadingEarlier: sessionMatchesCurrentPath && isLoadingEarlier,
    loadEarlierError: sessionMatchesCurrentPath ? loadEarlierError : null,
    hasMore: historyBelongsToSession && hasMore,
    isStreaming: visibleIsStreaming,
    isGenerating: visibleIsGenerating,
    documentChanged: visibleDocumentChanged,
    error: visibleError,
    canRetry,
    send,
    stop,
    retry,
    loadEarlier
  };
}
