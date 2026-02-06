import { LRUCache } from "@/shared/domain/lru";
import type { SearchResult } from "@/features/search/domain/types";

const searchCache = new LRUCache<string, SearchResult>(100);

export function getCachedSearch(key: string): SearchResult | undefined {
  return searchCache.get(key);
}

export function setCachedSearch(key: string, value: SearchResult): void {
  searchCache.set(key, value);
}
