import fs from "node:fs";
import path from "node:path";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { syncPrFilesSnapshot } from "@/features/reviews/services/prFilesRepo";

let watcherStarted = false;
let watcher: fs.FSWatcher | null = null;
let syncTimer: NodeJS.Timeout | null = null;

function toPosixPath(inputPath: string): string {
  return inputPath.split(path.sep).join(path.posix.sep);
}

function scheduleSync(delayMs = 220): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncPrFilesSnapshot().catch((error) => {
      console.error("[pr-files-sync] sync failed", error);
    });
  }, delayMs);
}

export function ensurePrFilesWatcherStarted(): void {
  if (watcherStarted) {
    return;
  }

  watcherStarted = true;
  const { absolutePath: docsRoot } = resolveDocsPath("");

  try {
    watcher = fs.watch(docsRoot, { recursive: true }, (_eventType, fileName) => {
      if (!fileName) {
        scheduleSync();
        return;
      }

      const relative = toPosixPath(fileName.toString());
      if (relative === "pr" || relative.startsWith("pr/")) {
        scheduleSync();
      }
    });
    watcher.on("error", (error) => {
      console.error("[pr-files-sync] watcher error", error);
    });
  } catch (error) {
    console.warn("[pr-files-sync] watcher unavailable, fallback to request-time sync", error);
  }

  scheduleSync(0);
}
