import type { PrFileRecord } from "@/features/reviews/domain/types";
import { isPrDocsPath } from "@/features/docs/domain/pathAliases";

export type PrFilesCacheSnapshot = {
  files: PrFileRecord[];
  categories: string[];
  loadedAt: number;
};

export function shouldReusePrFilesCache(snapshot: PrFilesCacheSnapshot | null, now: number, maxAgeMs: number): boolean {
  if (!snapshot) {
    return false;
  }

  return now - snapshot.loadedAt < maxAgeMs;
}

export function shouldRefreshLatestPrFilesOnSelectionChange(previousSelectedPath: string, nextSelectedPath: string): boolean {
  if (!isPrDocsPath(nextSelectedPath)) {
    return false;
  }

  return previousSelectedPath !== nextSelectedPath;
}
