import { NextRequest, NextResponse } from "next/server";
import { PathSecurityError } from "@/features/docs/domain/pathRules";
import { searchDocs } from "@/features/search/services/rgSearchService";
import { badRequest, serverError } from "@/shared/utils/http";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!q) {
      return badRequest("q is required");
    }

    const page = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
    const size = Number.parseInt(request.nextUrl.searchParams.get("size") ?? "20", 10);
    const scope = request.nextUrl.searchParams.get("scope") ?? "";
    const type = request.nextUrl.searchParams.get("type") ?? "all";
    const sort = request.nextUrl.searchParams.get("sort") ?? "relevance";

    const result = await searchDocs({
      q,
      page,
      size,
      scope,
      type: type as "all" | "md" | "code" | "pdf",
      sort: sort as "relevance" | "mtime"
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PathSecurityError || error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
