import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { createClient } from "@/lib/supabase/server";
import {
  buildDocumentExtractionPrompt,
  DOCUMENT_EXTRACTION_MODEL,
  normalizedDocumentSchema,
  type NormalizedDocument,
} from "@/lib/document-extraction";
import {
  INSPECTION_EXTRACTION_PROMPT,
  INSPECTION_MODEL,
  inspectionExtractionSchema,
  type InspectionExtraction,
} from "@/lib/inspection-extraction";
import { extractDocumentTextPages } from "@/lib/pdf-text";
import {
  buildPhotoSearchContent,
  PHOTO_EXTRACTION_MODEL,
  PHOTO_EXTRACTION_PROMPT,
  photoExtractionSchema,
  type PhotoExtraction,
} from "@/lib/photo-extraction";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
export type ProcessableDocumentType = "inspection" | "quote" | "invoice" | "receipt" | "photo";

type DocumentRecord = {
  id: string;
  property_id: string;
  document_type: ProcessableDocumentType;
  storage_bucket: string | null;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  sha256: string | null;
};

export type DocumentProcessingResult =
  | (InspectionExtraction & { documentType: "inspection"; documentId: string; runId: string; usage: TokenUsage })
  | { documentType: "quote" | "invoice" | "receipt"; documentId: string; runId: string; normalized: NormalizedDocument; usage: TokenUsage }
  | { documentType: "photo"; documentId: string; runId: string; analysis: PhotoExtraction; usage: TokenUsage };

type TokenUsage = { inputTokens: number; outputTokens: number } | null;

export class DocumentNotFoundError extends Error {}
export class DocumentProcessingStartError extends Error {}

const supportedDocumentTypes = new Set<ProcessableDocumentType>(["inspection", "quote", "invoice", "receipt", "photo"]);

function isProcessableDocumentType(value: string): value is ProcessableDocumentType {
  return supportedDocumentTypes.has(value as ProcessableDocumentType);
}

function tokenUsage(usage: { input_tokens?: number; output_tokens?: number } | undefined): TokenUsage {
  return usage ? { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 } : null;
}

async function assertUpdate(error: { message: string } | null, message: string) {
  if (error) throw new Error(`${message}: ${error.message}`);
}

async function indexPdf(supabase: SupabaseClient, document: DocumentRecord, signedUrl: string) {
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("The uploaded PDF could not be read for text indexing.");
  const pages = await extractDocumentTextPages(await response.arrayBuffer());
  const { error: pagesError } = await supabase.from("document_text_pages").upsert(
    pages.map((page) => ({
      document_id: document.id,
      page_number: page.pageNumber,
      content: page.content,
      content_sha256: page.contentSha256,
    })),
    { onConflict: "document_id,page_number" },
  );
  if (pagesError) throw new Error(`The attachment text could not be indexed: ${pagesError.message}`);
  const { error: stalePagesError } = await supabase.from("document_text_pages").delete().eq("document_id", document.id).gt("page_number", pages.length);
  await assertUpdate(stalePagesError, "Old attachment pages could not be removed");
  const { error: pageCountError } = await supabase.from("documents").update({ page_count: pages.length }).eq("id", document.id);
  await assertUpdate(pageCountError, "The attachment page count could not be saved");
}

async function extractDocument(document: DocumentRecord, signedUrl: string) {
  const isInspection = document.document_type === "inspection";
  const isPhoto = document.document_type === "photo";
  const model = isPhoto ? PHOTO_EXTRACTION_MODEL : isInspection ? INSPECTION_MODEL : DOCUMENT_EXTRACTION_MODEL;
  const format = isPhoto
    ? zodTextFormat(photoExtractionSchema, "photo_extraction")
    : isInspection
      ? zodTextFormat(inspectionExtractionSchema, "inspection_extraction")
      : zodTextFormat(normalizedDocumentSchema, "normalized_document");
  const prompt = isPhoto
    ? PHOTO_EXTRACTION_PROMPT
    : isInspection
      ? INSPECTION_EXTRACTION_PROMPT
      : buildDocumentExtractionPrompt({
          documentType: document.document_type as "quote" | "invoice" | "receipt",
          originalFilename: document.original_filename,
          privateObjectKey: document.storage_key,
          sha256: document.sha256 ?? "0".repeat(64),
        });
  const content = isPhoto
    ? [
        { type: "input_text" as const, text: prompt },
        { type: "input_image" as const, image_url: signedUrl, detail: "high" as const },
      ]
    : [
        { type: "input_file" as const, file_url: signedUrl, detail: "high" as const },
        { type: "input_text" as const, text: prompt },
      ];
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).responses.parse({
    model,
    store: false,
    reasoning: { effort: "low" },
    input: [{ role: "user", content }],
    text: { format },
  });
  if (!response.output_parsed) throw new Error("The document could not be converted into structured information.");

  const result = isPhoto
    ? photoExtractionSchema.parse(response.output_parsed)
    : isInspection
      ? inspectionExtractionSchema.parse(response.output_parsed)
      : normalizedDocumentSchema.parse(response.output_parsed);
  return { model, result, usage: response.usage };
}

function validateFinancialType(document: DocumentRecord, result: NormalizedDocument) {
  const matches = document.document_type === "invoice"
    ? result.document.type === "invoice"
    : document.document_type === "receipt"
      ? result.document.type === "receipt"
      : result.document.type === "proposal" || result.document.type === "estimate";
  if (!matches) throw new Error(`The PDF did not appear to be the selected ${document.document_type} type.`);
  result.document.sourceFile.originalFilename = document.original_filename;
  result.document.sourceFile.privateObjectKey = document.storage_key;
  result.document.sourceFile.sha256 = document.sha256 ?? result.document.sourceFile.sha256;
}

function responseFor(document: DocumentRecord, runId: string, result: InspectionExtraction | NormalizedDocument | PhotoExtraction, usage: TokenUsage): DocumentProcessingResult {
  if (document.document_type === "inspection") return { documentType: "inspection", documentId: document.id, runId, ...(result as InspectionExtraction), usage };
  if (document.document_type === "photo") return { documentType: "photo", documentId: document.id, runId, analysis: result as PhotoExtraction, usage };
  return { documentType: document.document_type, documentId: document.id, runId, normalized: result as NormalizedDocument, usage };
}

export async function processDocument(supabase: SupabaseClient, input: { documentId: string; userId: string }): Promise<DocumentProcessingResult> {
  const { data } = await supabase
    .from("documents")
    .select("id, property_id, document_type, storage_bucket, storage_key, original_filename, mime_type, sha256")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!data || !isProcessableDocumentType(data.document_type)) throw new DocumentNotFoundError("Supported attachment not found.");
  const document = data as DocumentRecord;
  const model = document.document_type === "photo" ? PHOTO_EXTRACTION_MODEL : document.document_type === "inspection" ? INSPECTION_MODEL : DOCUMENT_EXTRACTION_MODEL;

  const { data: run, error: runError } = await supabase.from("extraction_runs").insert({
    document_id: document.id,
    property_id: document.property_id,
    model,
    status: "processing",
    created_by: input.userId,
  }).select("id").single();
  if (runError || !run) throw new DocumentProcessingStartError("Could not start document analysis.");

  try {
    const { error: processingError } = await supabase.from("documents").update({ status: "processing", processing_error_code: null }).eq("id", document.id);
    await assertUpdate(processingError, "The attachment could not be marked as processing");
    const bucket = document.storage_bucket ?? "documents";
    const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(document.storage_key, 1800);
    if (signedError || !signed?.signedUrl) throw new Error("The uploaded attachment could not be opened securely.");

    if (document.document_type !== "photo") await indexPdf(supabase, document, signed.signedUrl);
    const extracted = await extractDocument(document, signed.signedUrl);
    const result = extracted.result;
    if (document.document_type !== "inspection" && document.document_type !== "photo") validateFinancialType(document, result as NormalizedDocument);

    if (document.document_type === "photo") {
      const searchableContent = buildPhotoSearchContent(result as PhotoExtraction);
      const { error: photoPageError } = await supabase.from("document_text_pages").upsert({
        document_id: document.id,
        page_number: 1,
        content: searchableContent,
        content_sha256: createHash("sha256").update(searchableContent).digest("hex"),
      }, { onConflict: "document_id,page_number" });
      if (photoPageError) throw new Error(`The photo analysis could not be indexed: ${photoPageError.message}`);
    }

    const documentDateCandidate = document.document_type === "inspection"
      ? (result as InspectionExtraction).report.inspectionDate
      : document.document_type === "photo"
        ? null
        : (result as NormalizedDocument).document.issuedOn.value;
    const documentDate = documentDateCandidate && /^\d{4}-\d{2}-\d{2}$/.test(documentDateCandidate) ? documentDateCandidate : null;
    const pageCount = document.document_type === "inspection"
      ? (result as InspectionExtraction).report.pageCount
      : document.document_type === "photo"
        ? 1
        : (result as NormalizedDocument).document.sourceFile.pageCount;
    const usage = tokenUsage(extracted.usage);

    const [runUpdate, documentUpdate] = await Promise.all([
      supabase.from("extraction_runs").update({
        status: "review_ready",
        result,
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
      }).eq("id", run.id),
      supabase.from("documents").update({ status: "review_ready", document_date: documentDate, page_count: pageCount }).eq("id", document.id),
    ]);
    await assertUpdate(runUpdate.error, "The extraction result could not be saved");
    await assertUpdate(documentUpdate.error, "The attachment status could not be saved");
    return responseFor(document, run.id, result, usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document analysis failed.";
    await Promise.all([
      supabase.from("extraction_runs").update({ status: "failed", error_code: "extraction_failed", error_message: message.slice(0, 1000) }).eq("id", run.id),
      supabase.from("documents").update({ status: "failed", processing_error_code: "extraction_failed" }).eq("id", document.id),
    ]);
    throw error;
  }
}
