import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ documentId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ error: "Sign in to view this document." }, { status: 401 });

  const { data: document } = await supabase.from("documents").select("storage_key,storage_bucket").eq("id", documentId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data, error } = await supabase.storage
    .from(document.storage_bucket ?? "documents")
    .createSignedUrl(document.storage_key, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not open this private document." }, { status: 500 });

  const pageValue = new URL(request.url).searchParams.get("page");
  const page = pageValue && /^\d+$/.test(pageValue) ? Number(pageValue) : null;
  const response = NextResponse.redirect(`${data.signedUrl}${page && page > 0 ? `#page=${page}` : ""}`, 307);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
