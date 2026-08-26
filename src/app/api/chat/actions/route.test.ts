import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryResult, queuedSupabaseClient } from "@/test/supabase-query-mock";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { POST } from "./route";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const propertyId = "22222222-2222-4222-8222-222222222222";
const workItemId = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-08-25T12:00:00.000Z";

const createPropertyAction = {
  type: "create_property",
  summary: "Add the Oak Street rental.",
  displayName: "Oak Street Rental",
  propertyType: "rental",
  addressLine1: "123 Oak Street",
  city: "Atlanta",
  region: "GA",
  postalCode: "30303",
  timezone: "America/New_York",
};

const createAction = {
  type: "create_work_item",
  summary: "Create a gutter cleaning item.",
  propertyId,
  title: "Clean gutters",
  description: "Remove leaves and debris.",
  category: "Roof and Drainage",
  area: "Exterior",
  workType: "maintain",
  status: "inbox",
  priority: "routine",
  targetStartOn: null,
  targetEndOn: null,
  note: "Added after discussing roof maintenance.",
};

const updateAction = {
  type: "update_work_item",
  summary: "Mark the A/C item complete.",
  workItemId,
  expectedUpdatedAt: updatedAt,
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
});

describe("POST /api/chat/actions", () => {
  it("rejects an invalid action before opening Supabase", async () => {
    const response = await POST(request({ type: "create_work_item", title: "Missing fields" }));
    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner", async () => {
    const client = queuedSupabaseClient({ claims: null, tables: {} });
    mocks.createClient.mockResolvedValue(client as never);
    const response = await POST(request(createAction));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: /Sign in/ });
  });

  it("creates a work item and an auditable activity event", async () => {
    const property = queryResult({ id: propertyId });
    const category = queryResult({ id: "category-1" });
    const area = queryResult({ id: "area-1" });
    const work = queryResult({
      id: workItemId,
      source_key: "chat-created",
      source_section: null,
      title: createAction.title,
      status: "inbox",
      priority: "routine",
      target_start_on: null,
      target_end_on: null,
      categories: [{ name: createAction.category }],
      areas: [{ name: createAction.area }],
    });
    const activity = queryResult();
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      properties: [property],
      categories: [category],
      areas: [area],
      work_items: [work],
      activity_events: [activity],
    } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request(createAction));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ message: "Work item created.", workItem: { id: workItemId, title: "Clean gutters" } });
    expect(work.insert).toHaveBeenCalledWith(expect.objectContaining({
      property_id: propertyId,
      title: "Clean gutters",
      source_type: "chat",
      created_by: userId,
      updated_by: userId,
    }));
    expect(activity.insert).toHaveBeenCalledWith(expect.objectContaining({
      work_item_id: workItemId,
      event_type: "created",
      note: createAction.note,
      created_by: userId,
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/chat");
  });

  it("creates a household property after owner confirmation", async () => {
    const membership = queryResult({ account_id: "33333333-3333-4333-8333-333333333333" });
    const property = queryResult({
      id: propertyId,
      display_name: createPropertyAction.displayName,
      property_type: "rental",
      address_line1: createPropertyAction.addressLine1,
      city: "Atlanta",
      region: "GA",
      postal_code: "30303",
      timezone: "America/New_York",
    });
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      account_memberships: [membership],
      properties: [property],
    } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request(createPropertyAction));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: "Property created.",
      property: { id: propertyId, displayName: "Oak Street Rental", propertyType: "rental" },
    });
    expect(membership.eq).toHaveBeenCalledWith("role", "owner");
    expect(property.insert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: "33333333-3333-4333-8333-333333333333",
      display_name: "Oak Street Rental",
      property_type: "rental",
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/household");
  });

  it("does not let a non-owner create a household property", async () => {
    const membership = queryResult(null);
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: { account_memberships: [membership] } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request(createPropertyAction));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: /Only a household owner/ });
  });

  it("rejects a stale proposal without writing", async () => {
    const current = queryResult({ id: workItemId, property_id: propertyId, status: "planned", updated_at: "2026-08-26T12:00:00.000Z" });
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: { work_items: [current] } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request(updateAction));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: /changed since this proposal/ });
    expect(current.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates status with optimistic concurrency and records the transition", async () => {
    const current = queryResult({ id: workItemId, property_id: propertyId, status: "planned", updated_at: updatedAt });
    const updated = queryResult({
      id: workItemId,
      source_key: "5.1.4",
      source_section: "5.1.4",
      title: "Service A/C",
      status: "completed",
      priority: "routine",
      target_start_on: null,
      target_end_on: null,
      categories: [{ name: "HVAC and Ventilation" }],
      areas: [{ name: "Upstairs" }],
    });
    const activity = queryResult();
    const client = queuedSupabaseClient({ claims: { sub: userId }, tables: {
      work_items: [current, updated],
      activity_events: [activity],
    } });
    mocks.createClient.mockResolvedValue(client as never);

    const response = await POST(request(updateAction));
    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      completed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      updated_by: userId,
    }));
    expect(updated.eq).toHaveBeenCalledWith("updated_at", updatedAt);
    expect(activity.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "status_change",
      status_from: "planned",
      status_to: "completed",
      note: updateAction.note,
    }));
  });
});
