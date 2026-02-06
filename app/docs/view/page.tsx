import { redirect } from "next/navigation";

export default function DocsViewPage({ searchParams }: { searchParams: { path?: string; line?: string } }): null {
  const path = searchParams.path;
  if (!path) {
    redirect("/docs");
  }

  const params = new URLSearchParams();
  params.set("path", path);

  const line = Number.parseInt(searchParams.line ?? "", 10);
  const hash = Number.isFinite(line) && line > 0 ? `#L${line}` : "";

  redirect(`/docs?${params.toString()}${hash}`);
}
