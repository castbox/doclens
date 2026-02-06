import { Suspense } from "react";
import { DocsWorkspace } from "@/features/docs/ui/DocsWorkspace";

export default function DocsPage(): React.JSX.Element {
  return (
    <Suspense>
      <DocsWorkspace />
    </Suspense>
  );
}
