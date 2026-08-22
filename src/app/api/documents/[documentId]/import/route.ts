import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  runId: z.string().uuid(),
  replaceExisting: z.boolean().default(false),
  preserveSection: z.string().nullable().default(null),
});

type Context = { params: Promise<{ documentId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { documentId } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid import request." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.json({ error: "Sign in to import an inspection." }, { status: 401 });

  const { data: run } = await supabase.from("extraction_runs").select("id, document_id").eq("id", parsed.data.runId).eq("document_id", documentId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Extraction run not found." }, { status: 404 });

  const { data, error } = await supabase.rpc("accept_inspection_extraction", {
    target_run_id: run.id,
    replace_existing: parsed.data.replaceExisting,
    preserve_section: parsed.data.preserveSection,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/");
  return NextResponse.json(data);
}
