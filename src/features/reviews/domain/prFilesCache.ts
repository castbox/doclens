import type { PrFileRecord } from "@/features/reviews/domain/types";

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
