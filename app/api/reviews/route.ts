import { NextRequest, NextResponse } from "next/server";
import { createReviewSheet, listReviewSheets } from "@/features/reviews/services/reviewRepo";
import { validateCreateReviewSheet } from "@/features/reviews/domain/reviewValidation";
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const input = validateCreateReviewSheet(payload);
    const created = await createReviewSheet(input);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
