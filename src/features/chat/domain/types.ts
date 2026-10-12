export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

export type ChatMessageStatus = "pending" | "streaming" | "complete" | "stopped" | "error";

export type ChatMessage = ChatTurn & {
  id: string;
  status: ChatMessageStatus;
  error: string | null;
};

export type DocumentChatRequest =
  | { path: string; action: "summary" }
  | { path: string; action: "send"; content: string }
  | { path: string; action: "retry"; messageId: string };

export type StandaloneChatRequest =
  | { conversationId: string; action: "send"; content: string }
  | { conversationId: string; action: "retry"; messageId: string };

export type ChatRequest = DocumentChatRequest | StandaloneChatRequest;

export type ChatDocumentIdentity = {
  docsRoot: string;
  path: string;
  repositoryPath: string;
  revision: string;
};

export type StandaloneChatIdentity = {
  docsRoot: string;
  conversationId: string;
};

export type ChatHistoryPayload = {
  conversationId: string | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  documentChanged: boolean;
  hasMore: boolean;
};

export type ChatGeneration = {
  scope: "document" | "standalone";
  docsRoot: string;
  conversationId: string;
  generationId: string;
  assistantMessageId: string;
  messages: ChatTurn[];
  history: ChatHistoryPayload;
  contextLimited?: boolean;
};

export type ChatStreamEvent =
  | { type: "history"; history: ChatHistoryPayload }
  | { type: "delta"; messageId: string; text: string }
  | { type: "error"; message: string; history?: ChatHistoryPayload }
  | { type: "done"; history: ChatHistoryPayload };

export const MAX_CHAT_MESSAGES = 40;
export const MAX_QUESTION_CHARS = 4_000;
export const MAX_CHAT_MESSAGE_CHARS = 32_000;
export const MAX_CHAT_HISTORY_CHARS = 100_000;
export const MAX_CHAT_HISTORY_PAGE_MESSAGES = 40;
export const MAX_CHAT_HISTORY_PAGE_CHARS = 100_000;
export const MAX_CHAT_DOCUMENT_CHARS = 100_000;
export const MAX_CHAT_DOCUMENT_BYTES = 524_288;
export const MAX_CHAT_REQUEST_BYTES = 524_288;
