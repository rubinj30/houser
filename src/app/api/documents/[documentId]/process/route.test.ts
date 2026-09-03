import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryResult, queuedSupabaseClient } from "@/test/supabase-query-mock";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  parse: vi.fn(),
  extractDocumentTextPages: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/pdf-text", () => ({ extractDocumentTextPages: mocks.extractDocumentTextPages }));
vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { parse: mocks.parse };
  },
}));

import { POST } from "./route";

const documentId = "33333333-3333-4333-8333-333333333333";
const propertyId = "22222222-2222-4222-8222-222222222222";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const analysis = {
  title: "Water staining near upstairs vent",
  summary: "A ceiling vent has nearby discoloration.",
  visibleText: "",
  category: "HVAC",
  area: "Upstairs bedroom",
  observations: ["Brown discoloration is visible beside the vent."],
  safetyConcerns: [],
  suggestedWorkTitle: "Investigate staining near upstairs vent",
  suggestedWorkDescription: "Determine whether the staining is active and identify the source.",
  confidence: "medium",
};

const inspection = {
  schemaVersion: 1,
  report: { propertyAddress: "123 Test Street", inspectionDate: "2026-08-01", inspectorCompany: "Test Inspector", pageCount: 2, summary: "Synthetic inspection" },
  findings: [{ sourceSection: "5.1.4", title: "Repair test wiring", category: "Electrical", area: "Kitchen", location: "Under sink", workType: "repair", severity: "safety_hazard", priority: "urgent", recommendation: "Use a junction box.", sourcePages: [2], sourceExcerpt: "Synthetic loose wiring finding.", confidence: 0.98 }],
  reviewWarnings: [],
};

const financial = {
  schemaVersion: 1,
  document: {
    type: "estimate",
    title: "Synthetic HVAC quote",
    sourceFile: { originalFilename: "model-name.pdf", privateObjectKey: "model/path.pdf", sha256: "b".repeat(64), pageCount: 1 },
    issuedOn: { value: "2026-08-02", confidence: 1, evidence: { pages: [1], excerpt: "Issued August 2" } },
    expiresOn: { value: null, confidence: 0, evidence: null },
    externalReference: { value: null, confidence: 0, evidence: null },
    acceptanceStatus: "proposed",
    summary: "Replace synthetic HVAC equipment.",
  },
  propertyMatch: { propertyKey: null, address: { value: null, confidence: 0, evidence: null }, confidence: 0 },
  vendor: {
    name: { value: "Example HVAC", confidence: 1, evidence: { pages: [1], excerpt: "Example HVAC" } },
    representativeName: { value: null, confidence: 0, evidence: null },
    representativeEmail: { value: null, confidence: 0, evidence: null },
    representativePhone: { value: null, confidence: 0, evidence: null },
  },
  financials: {
    subtotal: { amountMinor: 100000, currency: "USD", confidence: 1, evidence: { pages: [1], excerpt: "$1,000" } },
    discountTotal: { amountMinor: null, currency: "USD", confidence: 0, evidence: null },
    taxTotal: { amountMinor: null, currency: "USD", confidence: 0, evidence: null },
    total: { amountMinor: 100000, currency: "USD", confidence: 1, evidence: { pages: [1], excerpt: "$1,000" } },
    paymentSchedule: [],
  },
  scopeItems: [{ key: "hvac", kind: "equipment", description: "Replace HVAC", quantity: 1, amount: { amountMinor: 100000, currency: "USD", confidence: 1, evidence: { pages: [1], excerpt: "$1,000" } }, category: "HVAC", area: "Attic", assetMatchKey: null, specifications: [], evidence: { pages: [1], excerpt: "Replace HVAC" } }],
  terms: [],
  proposedRecords: { vendor: true, workItems: [{ title: "Replace HVAC", category: "HVAC", area: "Attic", workType: "Replacement", status: "inbox", estimatedCostMinor: 100000, sourcePages: [1] }], assets: [] },
  review: { required: true, warnings: [], unresolvedFields: [] },
};

function callPost() {
  return POST(new Request(`http://houser.test/api/documents/${documentId}/process`, { method: "POST" }), { params: Promise.resolve({ documentId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  mocks.extractDocumentTextPages.mockResolvedValue([{ pageNumber: 1, content: "Synthetic indexed text", contentSha256: "c".repeat(64) }]);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 })));
});

describe("POST /api/documents/:documentId/process for photos", () => {
  it("requires authentication before reading an attachment", async () => {
    const client = queuedSupabaseClient({ claims: null, tables: {} });
    mocks.createClient.mockResolvedValue(client as never);
    const response = await callPost();
    expect(response.status).toBe(401);
  });

  it("uses vision once and persists searchable photo analysis", async () => {
    const document = queryResult({ id: documentId, property_id: propertyId, document_type: "photo", storage_bucket: "documents", storage_key: `${propertyId}/${documentId}/original.png`, original_filename: "vent.png", mime_type: "image/png", sha256: "a".repeat(64) });
    const run = queryResult({ id: "44444444-4444-4444-8444-444444444444" });
    const processing = queryResult();
    const indexedPage = queryResult();
    const finalRun = queryResult();
    const finalDocument = queryResult();
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://storage.test/private-photo" }, error: null }));
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      documents: [document, processing, finalDocument],
      extraction_runs: [run, finalRun],
      document_text_pages: [indexedPage],
    }, storage: { createSignedUrl } });
    mocks.createClient.mockResolvedValue(client as never);
    mocks.parse.mockResolvedValue({ output_parsed: analysis, usage: { input_tokens: 120, output_tokens: 80 } });

    const response = await callPost();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ documentType: "photo", documentId, analysis: { title: analysis.title, confidence: "medium" } });
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect(mocks.parse).toHaveBeenCalledWith(expect.objectContaining({
      store: false,
      input: [expect.objectContaining({ content: expect.arrayContaining([
        expect.objectContaining({ type: "input_image", image_url: "https://storage.test/private-photo", detail: "high" }),
      ]) })],
    }));
    expect(indexedPage.upsert).toHaveBeenCalledWith(expect.objectContaining({
      document_id: documentId,
      page_number: 1,
      content: expect.stringContaining("Brown discoloration is visible"),
      content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }), { onConflict: "document_id,page_number" });
    expect(finalRun.update).toHaveBeenCalledWith(expect.objectContaining({ status: "review_ready", result: analysis, input_tokens: 120, output_tokens: 80 }));
    expect(finalDocument.update).toHaveBeenCalledWith(expect.objectContaining({ status: "review_ready", page_count: 1 }));
  });

  it("marks the run and document failed when vision extraction fails", async () => {
    const document = queryResult({ id: documentId, property_id: propertyId, document_type: "photo", storage_bucket: "documents", storage_key: "photo.png", original_filename: "photo.png", mime_type: "image/png", sha256: null });
    const run = queryResult({ id: "44444444-4444-4444-8444-444444444444" });
    const processing = queryResult();
    const failedRun = queryResult();
    const failedDocument = queryResult();
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      documents: [document, processing, failedDocument],
      extraction_runs: [run, failedRun],
    }, storage: { createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.test/private-photo" }, error: null })) } });
    mocks.createClient.mockResolvedValue(client as never);
    mocks.parse.mockRejectedValue(new Error("vision unavailable"));

    const response = await callPost();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "vision unavailable" });
    expect(failedRun.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error_code: "extraction_failed" }));
    expect(failedDocument.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", processing_error_code: "extraction_failed" }));
  });
});

describe("POST /api/documents/:documentId/process for PDFs", () => {
  it("indexes an inspection and returns sourced findings", async () => {
    const document = queryResult({ id: documentId, property_id: propertyId, document_type: "inspection", storage_bucket: "documents", storage_key: `${propertyId}/${documentId}/original.pdf`, original_filename: "inspection.pdf", mime_type: "application/pdf", sha256: "a".repeat(64) });
    const run = queryResult({ id: "44444444-4444-4444-8444-444444444444" });
    const processing = queryResult();
    const indexedPages = queryResult();
    const stalePages = queryResult();
    const pageCount = queryResult();
    const finalRun = queryResult();
    const finalDocument = queryResult();
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      documents: [document, processing, pageCount, finalDocument],
      extraction_runs: [run, finalRun],
      document_text_pages: [indexedPages, stalePages],
    }, storage: { createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.test/inspection" }, error: null })) } });
    mocks.createClient.mockResolvedValue(client as never);
    mocks.parse.mockResolvedValue({ output_parsed: inspection, usage: { input_tokens: 500, output_tokens: 200 } });

    const response = await callPost();
    await expect(response.json()).resolves.toMatchObject({ documentType: "inspection", findings: [{ sourceSection: "5.1.4" }], usage: { inputTokens: 500, outputTokens: 200 } });
    expect(response.status).toBe(200);
    expect(indexedPages.upsert).toHaveBeenCalledWith([expect.objectContaining({ document_id: documentId, page_number: 1 })], { onConflict: "document_id,page_number" });
    expect(stalePages.delete).toHaveBeenCalled();
    expect(finalRun.update).toHaveBeenCalledWith(expect.objectContaining({ status: "review_ready", result: expect.objectContaining({ findings: inspection.findings }) }));
  });

  it("normalizes a quote and overwrites model-supplied source identity", async () => {
    const document = queryResult({ id: documentId, property_id: propertyId, document_type: "quote", storage_bucket: "documents", storage_key: `${propertyId}/${documentId}/original.pdf`, original_filename: "actual-quote.pdf", mime_type: "application/pdf", sha256: "d".repeat(64) });
    const run = queryResult({ id: "44444444-4444-4444-8444-444444444444" });
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      documents: [document, queryResult(), queryResult(), queryResult()],
      extraction_runs: [run, queryResult()],
      document_text_pages: [queryResult(), queryResult()],
    }, storage: { createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.test/quote" }, error: null })) } });
    mocks.createClient.mockResolvedValue(client as never);
    mocks.parse.mockResolvedValue({ output_parsed: structuredClone(financial), usage: { input_tokens: 400, output_tokens: 150 } });

    const response = await callPost();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ documentType: "quote", normalized: { document: { type: "estimate", sourceFile: { originalFilename: "actual-quote.pdf", privateObjectKey: `${propertyId}/${documentId}/original.pdf`, sha256: "d".repeat(64) } } } });
  });
});
