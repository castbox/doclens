import fs from "node:fs";
import path from "node:path";
import { resolveDocsPath } from "@/features/docs/domain/pathRules";
import { hasPrFilesSnapshot, syncPrFilesSnapshot } from "@/features/reviews/services/prFilesRepo";

let watcherStarted = false;
let watcherAvailable = false;
let watcher: fs.FSWatcher | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let scheduledSyncPromise: Promise<void> | null = null;
let hasCompletedInitialSync = false;
let lastSyncAt = 0;

const FALLBACK_SYNC_TTL_MS = 5000;

function toPosixPath(inputPath: string): string {
  return inputPath.split(path.sep).join(path.posix.sep);
}

async function runSync(): Promise<void> {
  const syncPromise = syncPrFilesSnapshot()
    .then(() => {
      hasCompletedInitialSync = true;
      lastSyncAt = Date.now();
    })
    .finally(() => {
      if (scheduledSyncPromise === syncPromise) {
        scheduledSyncPromise = null;
      }
    });

  scheduledSyncPromise = syncPromise;
  return syncPromise;
}

function scheduleSync(delayMs = 220): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runSync().catch((error) => {
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
    watcherAvailable = true;
    watcher.on("error", (error) => {
      console.error("[pr-files-sync] watcher error", error);
    });
  } catch (error) {
    watcherAvailable = false;
    console.warn("[pr-files-sync] watcher unavailable, fallback to request-time sync", error);
  }

  scheduleSync(0);
}

export async function ensurePrFilesSnapshotReady(): Promise<void> {
  ensurePrFilesWatcherStarted();

  if (!hasCompletedInitialSync) {
    if (await hasPrFilesSnapshot()) {
      hasCompletedInitialSync = true;
      lastSyncAt = Date.now();
      return;
    }

    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }

    await runSync();
    return;
  }

  if (!watcherAvailable && Date.now() - lastSyncAt > FALLBACK_SYNC_TTL_MS) {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }

    await runSync();
  }
}
