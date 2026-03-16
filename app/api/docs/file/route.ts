import { NextRequest, NextResponse } from "next/server";
import { stripPathAnchor } from "@/features/docs/domain/anchor";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { getDocStarStatus } from "@/features/docs/services/docStarsRepo";
import { readFilePreview, readRawFile } from "@/features/docs/services/docsFsService";
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

    const raw = request.nextUrl.searchParams.get("raw") === "1";
    if (raw) {
      const rawFile = await readRawFile(safePathParam);
      return new NextResponse(rawFile.stream, {
        headers: {
          "Content-Type": rawFile.contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(rawFile.fileName)}"`
        }
      });
    }

    const full = request.nextUrl.searchParams.get("full") === "1";
    const [payload, star] = await Promise.all([readFilePreview(safePathParam, { fullContent: full }), getDocStarStatus(safePathParam)]);
    return NextResponse.json({
      ...payload,
      star
    });
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
