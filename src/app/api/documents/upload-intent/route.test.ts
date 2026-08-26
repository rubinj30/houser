import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryResult, queuedSupabaseClient } from "@/test/supabase-query-mock";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST } from "./route";

const propertyId = "22222222-2222-4222-8222-222222222222";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://houser.test/api/documents/upload-intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      propertyId,
      documentType: "photo",
      filename: "vent-stain.png",
      mimeType: "image/png",
      byteSize: 2048,
      sha256: "a".repeat(64),
      ...overrides,
    }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/documents/upload-intent", () => {
  it("rejects mismatched attachment types before creating a record", async () => {
    const response = await POST(request({ mimeType: "application/pdf" }));
    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const client = queuedSupabaseClient({ claims: null, tables: {} });
    mocks.createClient.mockResolvedValue(client as never);
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("creates a private image record and signed upload URL", async () => {
    const property = queryResult({ id: propertyId });
    const document = queryResult();
    const createSignedUploadUrl = vi.fn(async (storageKey: string) => ({ data: { token: "upload-token", path: storageKey }, error: null }));
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      properties: [property],
      documents: [document],
    }, storage: { createSignedUploadUrl } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.storageKey).toMatch(new RegExp(`^${propertyId}/\\d{4}/[0-9a-f-]+/original\\.png$`));
    expect(body.token).toBe("upload-token");
    expect(document.insert).toHaveBeenCalledWith(expect.objectContaining({
      property_id: propertyId,
      document_type: "photo",
      original_filename: "vent-stain.png",
      mime_type: "image/png",
      status: "queued",
      uploaded_by: userId,
    }));
    expect(createSignedUploadUrl).toHaveBeenCalledWith(body.storageKey);
  });

  it("removes the queued record when signing fails", async () => {
    const property = queryResult({ id: propertyId });
    const document = queryResult();
    const cleanup = queryResult();
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      properties: [property],
      documents: [document, cleanup],
    }, storage: { createSignedUploadUrl: vi.fn(async () => ({ data: null, error: { message: "storage unavailable" } })) } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(cleanup.delete).toHaveBeenCalled();
    expect(cleanup.eq).toHaveBeenCalledWith("id", expect.any(String));
  });
});
