import { NextRequest, NextResponse } from "next/server";
import { getReviewSheetById, updateReviewSheet } from "@/features/reviews/services/reviewRepo";
import { validateUpdateReviewSheet } from "@/features/reviews/domain/reviewValidation";
import { badRequest, notFound, serverError } from "@/shared/utils/http";

export async function GET(_request: NextRequest, context: { params: { id: string } }): Promise<NextResponse> {
  try {
    const review = await getReviewSheetById(context.params.id);
    if (!review) {
      return notFound("review not found");
    }

    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const patch = validateUpdateReviewSheet(payload);
    const review = await updateReviewSheet(context.params.id, patch);
    if (!review) {
      return notFound("review not found");
    }

    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
