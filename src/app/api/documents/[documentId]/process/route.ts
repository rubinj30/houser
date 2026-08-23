import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INSPECTION_EXTRACTION_PROMPT, INSPECTION_MODEL, inspectionExtractionSchema } from "@/lib/inspection-extraction";
import { buildDocumentExtractionPrompt, DOCUMENT_EXTRACTION_MODEL, normalizedDocumentSchema } from "@/lib/document-extraction";

export const maxDuration = 300;

type Context = { params: Promise<{ documentId: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Sign in to process a document." }, { status: 401 });

  const { data: document } = await supabase
    .from("documents")
    .select("id, property_id, document_type, storage_key, original_filename, sha256")
    .eq("id", documentId)
    .maybeSingle();
  if (!document || !["inspection", "quote", "invoice", "receipt"].includes(document.document_type)) return NextResponse.json({ error: "Supported document not found." }, { status: 404 });

  const isInspection = document.document_type === "inspection";
  const model = isInspection ? INSPECTION_MODEL : DOCUMENT_EXTRACTION_MODEL;

  const { data: run, error: runError } = await supabase.from("extraction_runs").insert({
    document_id: document.id,
    property_id: document.property_id,
    model,
    status: "processing",
    created_by: userId,
  }).select("id").single();
  if (runError || !run) return NextResponse.json({ error: "Could not start document analysis." }, { status: 500 });

  await supabase.from("documents").update({ status: "processing", processing_error_code: null }).eq("id", document.id);

  try {
    const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUrl(document.storage_key, 1800);
    if (signedError || !signed?.signedUrl) throw new Error("The uploaded PDF could not be opened securely.");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const format = isInspection
      ? zodTextFormat(inspectionExtractionSchema, "inspection_extraction")
      : zodTextFormat(normalizedDocumentSchema, "normalized_document");
    const prompt = isInspection
      ? INSPECTION_EXTRACTION_PROMPT
      : buildDocumentExtractionPrompt({
          documentType: document.document_type as "quote" | "invoice" | "receipt",
          originalFilename: document.original_filename,
          privateObjectKey: document.storage_key,
          sha256: document.sha256 ?? "0".repeat(64),
        });
    const response = await openai.responses.parse({
      model,
      store: false,
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          { type: "input_file", file_url: signed.signedUrl, detail: "high" },
          { type: "input_text", text: prompt },
        ],
      }],
      text: { format },
    });

    if (!response.output_parsed) throw new Error("The document could not be converted into structured information.");
    const result = isInspection
      ? inspectionExtractionSchema.parse(response.output_parsed)
      : normalizedDocumentSchema.parse(response.output_parsed);
    if ("document" in result) {
      const extractedTypeMatches = document.document_type === "invoice"
        ? result.document.type === "invoice"
        : document.document_type === "receipt"
          ? result.document.type === "receipt"
          : result.document.type === "proposal" || result.document.type === "estimate";
      if (!extractedTypeMatches) throw new Error(`The PDF did not appear to be the selected ${document.document_type} type.`);
      result.document.sourceFile.originalFilename = document.original_filename;
      result.document.sourceFile.privateObjectKey = document.storage_key;
      result.document.sourceFile.sha256 = document.sha256 ?? result.document.sourceFile.sha256;
    }
    const usage = response.usage;
    const extractedDocumentDate = "report" in result ? result.report.inspectionDate : result.document.issuedOn.value;
    const documentDate = extractedDocumentDate && /^\d{4}-\d{2}-\d{2}$/.test(extractedDocumentDate) ? extractedDocumentDate : null;
    const pageCount = "report" in result ? result.report.pageCount : result.document.sourceFile.pageCount;

    await Promise.all([
      supabase.from("extraction_runs").update({
        status: "review_ready",
        result,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
      }).eq("id", run.id),
      supabase.from("documents").update({
        status: "review_ready",
        document_date: documentDate,
        page_count: pageCount,
      }).eq("id", document.id),
    ]);

    return NextResponse.json("report" in result ? {
      documentType: "inspection",
      documentId: document.id,
      runId: run.id,
      report: result.report,
      findings: result.findings,
      reviewWarnings: result.reviewWarnings,
      usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : null,
    } : {
      documentType: document.document_type,
      documentId: document.id,
      runId: run.id,
      normalized: result,
      usage: usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document analysis failed.";
    await Promise.all([
      supabase.from("extraction_runs").update({ status: "failed", error_code: "extraction_failed", error_message: message.slice(0, 1000) }).eq("id", run.id),
      supabase.from("documents").update({ status: "failed", processing_error_code: "extraction_failed" }).eq("id", document.id),
    ]);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
