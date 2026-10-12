import { MAX_CHAT_HISTORY_CHARS, MAX_CHAT_MESSAGES, type ChatTurn } from "./types";

/**
 * Selects a recent, role-alternating model context without mutating or deleting
 * the persisted conversation history.
 */
export function selectChatContext(history: ChatTurn[]): ChatTurn[] {
  if (history.length === 0) {
    return [];
  }

  for (let index = 0; index < history.length; index += 1) {
    const turn = history[index];
    if ((turn.role !== "user" && turn.role !== "assistant") || typeof turn.content !== "string") {
      throw new Error(`Invalid chat history at message ${index + 1}`);
    }

    if (index > 0 && history[index - 1].role === turn.role) {
      throw new Error("Chat history roles must alternate");
    }
  }

  const currentUser = history[history.length - 1];
  if (currentUser.role !== "user") {
    throw new Error("Chat context must end with a user message");
  }

  const initialSummary = history[0].role === "assistant" ? history[0] : undefined;
  const firstConversationIndex = initialSummary ? 1 : 0;
  let selectedRecent: ChatTurn[] = [currentUser];
  const keepInitialSummary =
    initialSummary !== undefined && initialSummary.content.length + currentUser.content.length <= MAX_CHAT_HISTORY_CHARS;
  let selectedChars = currentUser.content.length + (keepInitialSummary ? initialSummary.content.length : 0);
  let selectedCount = 1 + (keepInitialSummary ? 1 : 0);

  // Add only complete recent user/assistant pairs before the current user turn.
  let assistantIndex = history.length - 2;
  while (assistantIndex >= firstConversationIndex) {
    const userIndex = assistantIndex - 1;
    const assistant = history[assistantIndex];
    const user = history[userIndex];

    if (!user || userIndex < firstConversationIndex || user.role !== "user" || assistant.role !== "assistant") {
      throw new Error("Chat history must contain complete user/assistant turns before the current question");
    }

    const pairChars = user.content.length + assistant.content.length;
    if (selectedCount + 2 > MAX_CHAT_MESSAGES || selectedChars + pairChars > MAX_CHAT_HISTORY_CHARS) {
      break;
    }

    selectedRecent = [user, assistant, ...selectedRecent];
    selectedCount += 2;
    selectedChars += pairChars;
    assistantIndex -= 2;
  }

  return initialSummary && keepInitialSummary ? [initialSummary, ...selectedRecent] : selectedRecent;
}
