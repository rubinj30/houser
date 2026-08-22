import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INSPECTION_EXTRACTION_PROMPT, INSPECTION_MODEL, inspectionExtractionSchema } from "@/lib/inspection-extraction";

export const maxDuration = 300;

type Context = { params: Promise<{ documentId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Sign in to process an inspection." }, { status: 401 });

  const { data: document } = await supabase
    .from("documents")
    .select("id, property_id, storage_key, original_filename")
    .eq("id", documentId)
    .eq("document_type", "inspection")
    .maybeSingle();
  if (!document) return NextResponse.json({ error: "Inspection document not found." }, { status: 404 });

  const { data: run, error: runError } = await supabase.from("extraction_runs").insert({
    document_id: document.id,
    property_id: document.property_id,
    model: INSPECTION_MODEL,
    status: "processing",
    created_by: userId,
  }).select("id").single();
  if (runError || !run) return NextResponse.json({ error: "Could not start inspection analysis." }, { status: 500 });

  await supabase.from("documents").update({ status: "processing", processing_error_code: null }).eq("id", document.id);

  try {
    const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUrl(document.storage_key, 1800);
    if (signedError || !signed?.signedUrl) throw new Error("The uploaded PDF could not be opened securely.");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: INSPECTION_MODEL,
      store: false,
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          { type: "input_file", file_url: signed.signedUrl, detail: "high" },
          { type: "input_text", text: INSPECTION_EXTRACTION_PROMPT },
        ],
      }],
      text: { format: zodTextFormat(inspectionExtractionSchema, "inspection_extraction") },
    });

    if (!response.output_parsed) throw new Error("The inspection could not be converted into structured findings.");
    const result = inspectionExtractionSchema.parse(response.output_parsed);
    const usage = response.usage;

    await Promise.all([
      supabase.from("extraction_runs").update({
        status: "review_ready",
        result,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
      }).eq("id", run.id),
      supabase.from("documents").update({
        status: "review_ready",
        document_date: result.report.inspectionDate,
        page_count: result.report.pageCount,
      }).eq("id", document.id),
    ]);

    return NextResponse.json({
      documentId: document.id,
      runId: run.id,
      report: result.report,
      findings: result.findings,
      reviewWarnings: result.reviewWarnings,
      usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inspection analysis failed.";
    await Promise.all([
      supabase.from("extraction_runs").update({ status: "failed", error_code: "extraction_failed", error_message: message.slice(0, 1000) }).eq("id", run.id),
      supabase.from("documents").update({ status: "failed", processing_error_code: "extraction_failed" }).eq("id", document.id),
    ]);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
