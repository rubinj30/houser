import { NextResponse } from "next/server";
import { DocumentNotFoundError, processDocument } from "@/lib/document-processing";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

type Context = { params: Promise<{ documentId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Sign in to process a document." }, { status: 401 });

  try {
    return NextResponse.json(await processDocument(supabase, { documentId, userId }));
  } catch (error) {
    const status = error instanceof DocumentNotFoundError ? 404 : 500;
    const message = error instanceof Error ? error.message : "Document analysis failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
