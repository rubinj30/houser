import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET, POST } from "./route";

const workItemId = "11111111-1111-4111-8111-111111111111";
const relatedWorkItemId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ workItemId }) };
const relatedGroup = {
  group: { id: "33333333-3333-4333-8333-333333333333", label: "Mason visit" },
  relatedItems: [{ id: relatedWorkItemId, title: "Repair damaged brick", sourceSection: "6.1.3", category: "Exterior", status: "inbox", priority: "important" }],
};

function client({ userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", data = relatedGroup, error = null }: { userId?: string | null; data?: unknown; error?: { message: string } | null } = {}) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: userId ? { claims: { sub: userId } } : null })) },
    rpc: vi.fn(async () => ({ data, error })),
  };
}

function postRequest(body: unknown) {
  return new Request(`http://houser.test/api/work-items/${workItemId}/related`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("work item related-work API", () => {
  it("loads the authenticated item's related group", async () => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase as never);

    const response = await GET(new Request(`http://houser.test/api/work-items/${workItemId}/related`), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(relatedGroup);
    expect(supabase.rpc).toHaveBeenCalledWith("get_related_work_group", { target_work_item_id: workItemId });
  });

  it("requires authentication", async () => {
    const supabase = client({ userId: null });
    mocks.createClient.mockResolvedValue(supabase as never);

    const response = await GET(new Request(`http://houser.test/api/work-items/${workItemId}/related`), context);

    expect(response.status).toBe(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("saves a named group with de-duplicated work item IDs", async () => {
    const supabase = client();
    mocks.createClient.mockResolvedValue(supabase as never);

    const response = await POST(postRequest({ label: "Mason visit", workItemIds: [relatedWorkItemId, relatedWorkItemId] }), context);

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledWith("set_related_work_group", {
      target_work_item_id: workItemId,
      linked_work_item_ids: [relatedWorkItemId],
      group_label: "Mason visit",
    });
  });

  it("rejects an empty related-work selection before writing", async () => {
    const response = await POST(postRequest({ label: "Mason visit", workItemIds: [] }), context);

    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns a safe database validation error", async () => {
    const supabase = client({ error: { message: "Related work items must belong to the same property" } });
    mocks.createClient.mockResolvedValue(supabase as never);

    const response = await POST(postRequest({ label: "Mason visit", workItemIds: [relatedWorkItemId] }), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Related work items must belong to the same property" });
  });
});
