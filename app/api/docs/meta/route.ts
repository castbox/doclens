import { NextRequest, NextResponse } from "next/server";
import { stripPathAnchor } from "@/features/docs/domain/anchor";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { readPathMeta } from "@/features/docs/services/docsFsService";
import { badRequest, serverError } from "@/shared/utils/http";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const pathParam = request.nextUrl.searchParams.get("path");
    if (!pathParam) {
      return badRequest("path is required");
    }
    const safePathParam = stripPathAnchor(pathParam);
    if (!safePathParam) {
      return badRequest("path is required");
    }

    const payload = await readPathMeta(safePathParam);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
