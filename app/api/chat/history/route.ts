import { NextResponse } from "next/server";
import { isSameOriginRequest } from "../origin";
import { ChatValidationError, parseChatPath } from "@/features/chat/domain/chatValidation";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { ChatServiceError, readDocumentChatHistory } from "@/features/chat/services/deepseekChatService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_SERVER_ERROR_MESSAGE = "聊天记录暂时无法读取，请稍后重试。";
const MAX_HISTORY_CURSOR_CHARS = 128;

function jsonError(message: string, status: number): Response {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

function validServiceStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

export async function GET(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return jsonError("禁止跨站请求。", 403);
  }

  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(request.url).searchParams;
  } catch {
    return jsonError("聊天记录请求地址无效。", 400);
  }

  const pathValues = searchParams.getAll("path");
  if (pathValues.length !== 1) {
    return jsonError("必须提供唯一的文档 path 参数。", 400);
  }

  const cursorValues = searchParams.getAll("beforeMessageId");
  if (cursorValues.length > 1) {
    return jsonError("历史游标无效。", 400);
  }

  const beforeMessageId = cursorValues[0];
  if (
    beforeMessageId !== undefined &&
    (
      !beforeMessageId.trim() ||
      beforeMessageId.length > MAX_HISTORY_CURSOR_CHARS ||
      /[\u0000-\u001f\u007f-\u009f]/.test(beforeMessageId)
    )
  ) {
    return jsonError("历史游标无效。", 400);
  }

  let documentPath: string;
  try {
    documentPath = parseChatPath(pathValues[0]);
  } catch (error) {
    if (error instanceof ChatValidationError) {
      return jsonError(error.message, 400);
    }
    return jsonError("文档路径无效或不可访问。", 400);
  }

  try {
    const history =
      beforeMessageId === undefined
        ? await readDocumentChatHistory(documentPath)
        : await readDocumentChatHistory(documentPath, beforeMessageId);
    return NextResponse.json(history, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof PathSecurityError) {
      return jsonError("文档路径无效或不可访问。", 400);
    }

    if (error instanceof ChatServiceError && error.status === 409) {
      return jsonError("聊天记录状态已变化，请刷新后重试。", 409);
    }

    if (error instanceof ChatServiceError && validServiceStatus(error.status)) {
      return jsonError(error.message, error.status);
    }

    return jsonError(GENERIC_SERVER_ERROR_MESSAGE, 500);
  }
}
