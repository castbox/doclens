import { NextRequest, NextResponse } from "next/server";
import { ensurePrFilesWatcherStarted } from "@/features/reviews/services/prFilesSyncService";
import { listPrDateFolders, listPrFiles, syncPrFilesSnapshot } from "@/features/reviews/services/prFilesRepo";
import { badRequest, serverError } from "@/shared/utils/http";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    ensurePrFilesWatcherStarted();
    await syncPrFilesSnapshot();

    const dateFolder = request.nextUrl.searchParams.get("date") ?? undefined;
    const query = request.nextUrl.searchParams.get("q") ?? undefined;

    const [files, dates] = await Promise.all([listPrFiles({ dateFolder, query }), listPrDateFolders()]);
    return NextResponse.json({ files, dates });
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError();
  }
}
