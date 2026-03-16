import { NextRequest, NextResponse } from "next/server";
import { ensurePrFilesSnapshotReady } from "@/features/reviews/services/prFilesSyncService";
import { listPrCategories, listPrFiles } from "@/features/reviews/services/prFilesRepo";
import type { PrFileReadFilter } from "@/features/reviews/domain/types";
import { badRequest, serverError } from "@/shared/utils/http";

const VALID_READ_FILTERS: PrFileReadFilter[] = ["all", "read", "unread"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await ensurePrFilesSnapshotReady();

    const category = request.nextUrl.searchParams.get("category") ?? undefined;
    const readFilterParam = (request.nextUrl.searchParams.get("read") ?? "all") as PrFileReadFilter;
    if (!VALID_READ_FILTERS.includes(readFilterParam)) {
      return badRequest("read filter is invalid");
    }

    const [files, categories] = await Promise.all([listPrFiles({ category, readFilter: readFilterParam }), listPrCategories()]);
    return NextResponse.json({ files, categories });
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
