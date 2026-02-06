import { NextRequest, NextResponse } from "next/server";
import { listReviewSheets } from "@/features/reviews/services/reviewRepo";
import { badRequest, serverError } from "@/shared/utils/http";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const docPath = request.nextUrl.searchParams.get("doc_path") ?? undefined;
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const rows = await listReviewSheets({ docPath, status });
    return NextResponse.json({ reviews: rows });
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
