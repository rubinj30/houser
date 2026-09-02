import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  createHouseholdProperty: vi.fn(),
  createChatWorkItem: vi.fn(),
  updateChatWorkItem: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/property-mutations", () => ({ createHouseholdProperty: mocks.createHouseholdProperty }));
vi.mock("@/lib/work-planning", () => ({
  createChatWorkItem: mocks.createChatWorkItem,
  updateChatWorkItem: mocks.updateChatWorkItem,
}));

import { POST } from "./route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyId = "22222222-2222-4222-8222-222222222222";
const workItemId = "11111111-1111-4111-8111-111111111111";

const createAction = {
  type: "create_work_item",
  summary: "Create gutter cleaning.",
  propertyId,
  title: "Clean gutters",
  description: "Remove leaves.",
  category: "Roof and Drainage",
  area: "Exterior",
  workType: "maintain",
  status: "inbox",
  priority: "routine",
  targetStartOn: null,
  targetEndOn: null,
  note: "Discussed roof maintenance.",
};

const updateAction = {
  type: "update_work_item",
  summary: "Mark complete.",
  workItemId,
  expectedUpdatedAt: "2026-08-25T12:00:00.000Z",
  title: null,
  description: null,
  category: null,
  area: null,
  workType: null,
  status: "completed",
  priority: null,
  targetStartOn: null,
  targetEndOn: null,
  note: "Completed after service.",
};

function request(body: unknown) {
  return new Request("http://houser.test/api/chat/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: userId } }, error: null })) },
  });
});

describe("POST /api/chat/actions", () => {
  it("rejects invalid and unauthenticated actions", async () => {
    expect((await POST(request({ type: "create_work_item" }))).status).toBe(400);
    mocks.createClient.mockResolvedValueOnce({
      auth: { getClaims: vi.fn(async () => ({ data: null, error: null })) },
    });
    expect((await POST(request(createAction))).status).toBe(401);
  });

  it("delegates confirmed creates to Work planning", async () => {
    mocks.createChatWorkItem.mockResolvedValue({ id: workItemId, propertyId, title: createAction.title });
    const response = await POST(request(createAction));
    expect(response.status).toBe(200);
    expect(mocks.createChatWorkItem).toHaveBeenCalledWith(expect.anything(), createAction);
    await expect(response.json()).resolves.toMatchObject({ message: "Work item created.", workItem: { id: workItemId } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("delegates confirmed updates to Work planning", async () => {
    mocks.updateChatWorkItem.mockResolvedValue({ id: workItemId, propertyId, title: "Service A/C" });
    const response = await POST(request(updateAction));
    expect(response.status).toBe(200);
    expect(mocks.updateChatWorkItem).toHaveBeenCalledWith(expect.anything(), updateAction);
  });

  it("keeps property creation in the Property module", async () => {
    const action = {
      type: "create_property",
      summary: "Add rental.",
      displayName: "Oak Street",
      propertyType: "rental",
      addressLine1: null,
      city: null,
      region: null,
      postalCode: null,
      timezone: null,
    };
    mocks.createHouseholdProperty.mockResolvedValue({ id: propertyId, displayName: "Oak Street" });
    const response = await POST(request(action));
    expect(response.status).toBe(200);
    expect(mocks.createHouseholdProperty).toHaveBeenCalledWith(expect.anything(), userId, action);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/household");
  });

  it("returns Work planning conflicts without revalidating", async () => {
    mocks.updateChatWorkItem.mockRejectedValue(new Error("That Work item changed since this proposal was prepared."));
    const response = await POST(request(updateAction));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: /changed since/ });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
