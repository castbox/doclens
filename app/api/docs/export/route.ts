import { NextRequest, NextResponse } from "next/server";
import type { DocExportFormat } from "@/features/docs/domain/docExport";
import { stripPathAnchor } from "@/features/docs/domain/anchor";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { exportDocFile } from "@/features/docs/services/docExportService";
import { badRequest, serverError } from "@/shared/utils/http";

export const runtime = "nodejs";

function parseFormat(value: string | null): DocExportFormat | null {
  if (value === "doc" || value === "docx") {
    return value;
  }

  return null;
}

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

    const format = parseFormat(request.nextUrl.searchParams.get("format"));
    if (!format) {
      return badRequest("format must be doc or docx");
    }

    const result = await exportDocFile(safePathParam, format);
    const body = new ArrayBuffer(result.buffer.byteLength);
    new Uint8Array(body).set(result.buffer);

    return new NextResponse(body, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
