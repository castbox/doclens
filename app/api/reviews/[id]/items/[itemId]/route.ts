import { NextRequest, NextResponse } from "next/server";
import { updateReviewItem } from "@/features/reviews/services/reviewRepo";
import { validateUpdateReviewItem } from "@/features/reviews/domain/reviewValidation";
import { badRequest, notFound, serverError } from "@/shared/utils/http";

export async function PATCH(request: NextRequest, context: { params: { id: string; itemId: string } }): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const patch = validateUpdateReviewItem(payload);
    const item = await updateReviewItem(context.params.id, context.params.itemId, patch);
    if (!item) {
      return notFound("review item not found");
    }

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
