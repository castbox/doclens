import { NextResponse } from "next/server";
import { isSameOriginRequest } from "./origin";
import { ChatValidationError, parseChatRequest } from "@/features/chat/domain/chatValidation";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { MAX_CHAT_REQUEST_BYTES } from "@/features/chat/domain/types";
import { ChatServiceError, openDocumentChat, openStandaloneChat } from "@/features/chat/services/deepseekChatService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const INVALID_BODY_MESSAGE = "请求体必须是有效的 UTF-8 JSON。";
const GENERIC_SERVER_ERROR_MESSAGE = "聊天服务暂时不可用，请稍后重试。";

class RequestBodyTooLargeError extends Error {}

class InvalidRequestBodyError extends Error {}

function jsonError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

function declaresOversizedBody(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength || !/^\d+$/.test(contentLength)) {
    return false;
  }

  return Number(contentLength) > MAX_CHAT_REQUEST_BYTES;
}

async function readBoundedJsonBody(request: Request): Promise<unknown> {
  if (!request.body) {
    throw new InvalidRequestBodyError();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_CHAT_REQUEST_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // 取消请求体失败时仍返回体积上限错误。
        }
        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new InvalidRequestBodyError();
  }
}

function validServiceStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonError("禁止跨站请求。", 403);
  }

  if (declaresOversizedBody(request)) {
    return jsonError("请求内容超过 512 KiB 限制。", 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readBoundedJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError("请求内容超过 512 KiB 限制。", 413);
    }

    return jsonError(INVALID_BODY_MESSAGE, 400);
  }

  let chatRequest: ReturnType<typeof parseChatRequest>;
  try {
    chatRequest = parseChatRequest(parsedBody);
  } catch (error) {
    if (error instanceof ChatValidationError) {
      return jsonError(error.message, 400);
    }

    return jsonError(INVALID_BODY_MESSAGE, 400);
  }

  try {
    const stream = "conversationId" in chatRequest
      ? await openStandaloneChat(chatRequest, request.signal)
      : await openDocumentChat(chatRequest, request.signal);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream;charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    if (error instanceof PathSecurityError) {
      return jsonError("文档路径无效或不可访问。", 400);
    }

    if (error instanceof ChatServiceError && validServiceStatus(error.status)) {
      return jsonError(error.message, error.status);
    }

    return jsonError(GENERIC_SERVER_ERROR_MESSAGE, 500);
  }
}
