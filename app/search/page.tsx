import { Suspense } from "react";
import { SearchPageClient } from "@/features/search/ui/SearchPageClient";

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }): React.JSX.Element {
  return (
    <Suspense>
      <SearchPageClient initialQuery={searchParams.q ?? ""} />
    </Suspense>
  );
}
