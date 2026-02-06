import { redirect } from "next/navigation";

export default function DocsViewPage({ searchParams }: { searchParams: { path?: string } }): null {
  const path = searchParams.path;
  if (!path) {
    redirect("/docs");
  }

  redirect(`/docs?path=${encodeURIComponent(path)}`);
}
