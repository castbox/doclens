import { NextRequest, NextResponse } from "next/server";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { getDocStarStatus, listStarredDocs, setDocStarStatus } from "@/features/docs/services/docStarsRepo";
import { badRequest, serverError } from "@/shared/utils/http";

type UpdateDocStarPayload = {
  path?: string;
  isStarred?: boolean;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const path = request.nextUrl.searchParams.get("path");
    if (path) {
      const star = await getDocStarStatus(path);
      return NextResponse.json(star);
    }

    const stars = await listStarredDocs();
    return NextResponse.json({ stars });
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as UpdateDocStarPayload;
    if (!payload.path || typeof payload.path !== "string") {
      return badRequest("path is required");
    }

    const star = await setDocStarStatus(payload.path, payload.isStarred ?? true);
    return NextResponse.json(star);
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
