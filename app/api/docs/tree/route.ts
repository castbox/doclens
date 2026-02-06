import { NextRequest, NextResponse } from "next/server";
import { stripPathAnchor } from "@/features/docs/domain/anchor";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { listTreeNodes } from "@/features/docs/services/docsFsService";
import { badRequest, serverError } from "@/shared/utils/http";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const pathParam = stripPathAnchor(request.nextUrl.searchParams.get("path") ?? "");
    const nodes = await listTreeNodes(pathParam);
    return NextResponse.json({ path: pathParam, nodes });
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
