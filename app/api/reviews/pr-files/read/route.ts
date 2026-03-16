import { NextRequest, NextResponse } from "next/server";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { ensurePrFilesWatcherStarted } from "@/features/reviews/services/prFilesSyncService";
import { ensurePrFileTracked, markPrFileRead } from "@/features/reviews/services/prFilesRepo";
import { badRequest, notFound, serverError } from "@/shared/utils/http";

type MarkReadPayload = {
  path?: string;
  isRead?: boolean;
};

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as MarkReadPayload;
    if (!payload.path || typeof payload.path !== "string") {
      return badRequest("path is required");
    }

    const normalizedPath = resolveDocsPath(payload.path).relativePath;
    if (!normalizedPath.startsWith("pr/")) {
      return badRequest("path must be in pr directory");
    }

    ensurePrFilesWatcherStarted();
    await ensurePrFileTracked(normalizedPath);

    const row = await markPrFileRead(normalizedPath, payload.isRead ?? true);
    if (!row) {
      return notFound("pr file not found");
    }

    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
