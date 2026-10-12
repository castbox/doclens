import { NextResponse } from "next/server";
import { isSameOriginRequest } from "../origin";
import { ChatServiceError, createStandaloneChatConversation } from "@/features/chat/services/deepseekChatService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_SERVER_ERROR_MESSAGE = "无法创建聊天会话，请稍后重试。";

function jsonError(message: string, status: number): Response {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function validServiceStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

class InvalidRequestBodyError extends Error {}

async function hasRequestBodyBytes(request: Request): Promise<boolean> {
  if (!request.body) return false;

  const reader = request.body.getReader();
  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        throw new InvalidRequestBodyError();
      }
      if (result.done) return false;
      if (result.value.byteLength > 0) {
        void reader.cancel().catch(() => undefined);
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonError("禁止跨站请求。", 403);
  }

  let hasBodyBytes: boolean;
  try {
    hasBodyBytes = await hasRequestBodyBytes(request);
  } catch {
    return jsonError("创建聊天会话请求正文无效。", 400);
  }
  if (hasBodyBytes) {
    return jsonError("创建聊天会话不接受请求正文。", 400);
  }

  try {
    const history = await createStandaloneChatConversation();
    return NextResponse.json(history, {
      status: 201,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof ChatServiceError && validServiceStatus(error.status)) {
      return jsonError(error.message, error.status);
    }
    return jsonError(GENERIC_SERVER_ERROR_MESSAGE, 500);
  }
}
