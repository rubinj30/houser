import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryResult, queuedSupabaseClient } from "@/test/supabase-query-mock";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  parse: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
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

function callPost() {
  return POST(new Request(`http://houser.test/api/documents/${documentId}/process`, { method: "POST" }), { params: Promise.resolve({ documentId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
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
