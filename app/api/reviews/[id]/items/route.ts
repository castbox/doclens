import { NextRequest, NextResponse } from "next/server";
import { createReviewItem } from "@/features/reviews/services/reviewRepo";
import { validateCreateReviewItem } from "@/features/reviews/domain/reviewValidation";
import { badRequest, serverError } from "@/shared/utils/http";

export async function POST(request: NextRequest, context: { params: { id: string } }): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const input = validateCreateReviewItem(payload);
    const item = await createReviewItem(context.params.id, input);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
