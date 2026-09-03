import { describe, expect, it, vi } from "vitest";
import { queryResult } from "@/test/supabase-query-mock";
import {
  acceptRemainingInspectionFindings,
  completePlannedWorkItem,
  createChatWorkItem,
  createManualWorkItem,
  linkDocumentToWorkItem,
  normalizeWorkCategory,
  normalizeWorkType,
  recordWorkItemReview,
  updateChatWorkItem,
} from "./work-planning";

const propertyId = "22222222-2222-4222-8222-222222222222";
const workItemId = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-08-25T12:00:00.000Z";
const savedWork = {
  id: workItemId,
  propertyId,
  reference: "manual-test",
  title: "Service upstairs furnace",
  description: "Inspect before heating season.",
  category: "HVAC and Ventilation",
  area: "Upstairs",
  status: "inbox",
  priority: "routine",
  workType: "other",
  targetStartOn: null,
  targetEndOn: null,
  updatedAt,
};

function rpcClient(data: unknown = savedWork) {
  return { rpc: vi.fn(async () => ({ data, error: null })) };
}

describe("Work planning", () => {
  it("accepts the remaining inspection inbox through one transactional interface", async () => {
    const client = rpcClient({ acceptedCount: 2, workItemIds: [workItemId, "33333333-3333-4333-8333-333333333333"] });
    const result = await acceptRemainingInspectionFindings(client as never, { propertyId, mode: "reviewed_report" });
    expect(client.rpc).toHaveBeenCalledWith("accept_inspection_review", {
      target_property_id: propertyId,
      review_mode: "reviewed_report",
    });
    expect(result).toEqual({ acceptedCount: 2, workItemIds: [workItemId, "33333333-3333-4333-8333-333333333333"] });
  });

  it("owns the shared category vocabulary", () => {
    expect(normalizeWorkCategory("HVAC")).toBe("HVAC and Ventilation");
    expect(normalizeWorkCategory("Roof and Drainage")).toBe("Roof and Drainage");
    expect(normalizeWorkType("Replace the condenser")).toBe("replace");
    expect(normalizeWorkType("Monitor annually")).toBe("monitor");
  });

  it("creates quick-capture Work through the atomic planning interface", async () => {
    const client = rpcClient();
    const result = await createManualWorkItem(client as never, {
      propertyId,
      title: savedWork.title,
      description: savedWork.description,
      category: "HVAC",
      area: "Upstairs",
    });
    expect(client.rpc).toHaveBeenCalledWith("plan_work_item", expect.objectContaining({
      target_property_id: propertyId,
      new_category_name: "HVAC and Ventilation",
      new_source_type: "manual",
      new_status: "inbox",
    }));
    expect(result).toMatchObject({ workItemId, reportId: "manual-test", title: savedWork.title, isLocal: true });
  });

  it("uses the same planning interface for confirmed chat creates and updates", async () => {
    const client = rpcClient();
    await createChatWorkItem(client as never, {
      type: "create_work_item",
      summary: "Add work.", propertyId, title: "Clean gutters", description: "Remove leaves.",
      category: "Roof and Drainage", area: "Exterior", workType: "maintain", status: "planned",
      priority: "important", targetStartOn: null, targetEndOn: null, note: "Owner confirmed.",
    });
    await updateChatWorkItem(client as never, {
      type: "update_work_item",
      summary: "Complete work.", workItemId, expectedUpdatedAt: updatedAt,
      title: null, description: null, category: null, area: null, workType: null,
      status: "completed", priority: null, targetStartOn: null, targetEndOn: null, note: "Done.",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, "plan_work_item", expect.objectContaining({ new_source_type: "chat", new_status: "planned" }));
    expect(client.rpc).toHaveBeenNthCalledWith(2, "plan_work_item", expect.objectContaining({ target_work_item_id: workItemId, expected_updated_at: updatedAt, new_status: "completed" }));
  });

  it("records owner review through the transactional status interface", async () => {
    const event = queryResult({ id: "event-1", status_to: "planned", note: "Still active", created_at: updatedAt });
    const client = {
      rpc: vi.fn(async () => ({ data: savedWork, error: null })),
      from: vi.fn(() => event),
    };
    const result = await recordWorkItemReview(client as never, { workItemId, reportId: "5.1.4", status: "open", note: "Still active" });
    expect(client.rpc).toHaveBeenCalledWith("record_work_item_review", expect.objectContaining({ next_status: "planned" }));
    expect(result).toMatchObject({ status: "open", activity: { reportId: "5.1.4", note: "Still active" } });
  });

  it("turns completion into service history through Work planning", async () => {
    const service = queryResult({
      id: "service-1", performed_on: "2026-08-20", description: "Repaired drain", vendor_name: "HVAC Co",
      cost_minor: 12550, currency: "USD", warranty_ends_on: null, recurrence_months: 12, next_service_on: "2027-08-20",
    });
    const event = queryResult({ id: "event-1", status_to: "completed", note: "Repaired drain", created_at: updatedAt });
    const queues: Record<string, Array<ReturnType<typeof queryResult>>> = { service_records: [service], activity_events: [event] };
    const client = {
      rpc: vi.fn(async () => ({ data: { service_record_id: "service-1" }, error: null })),
      from: vi.fn((table: string) => queues[table].shift()),
    };
    const result = await completePlannedWorkItem(client as never, {
      workItemId, reportId: "manual-test", performedOn: "2026-08-20", vendorName: "HVAC Co", cost: "125.50",
      note: "Repaired drain", warrantyEndsOn: "", recurrenceMonths: 12,
    });
    expect(client.rpc).toHaveBeenCalledWith("complete_work_item", expect.objectContaining({ service_cost_minor: 12550 }));
    expect(result).toMatchObject({ status: "completed", nextServiceOn: "2027-08-20" });
  });

  it("normalizes uploaded Document destinations at the same seam", async () => {
    const client = rpcClient(workItemId);
    await linkDocumentToWorkItem(client as never, {
      documentId: "33333333-3333-4333-8333-333333333333",
      newWork: { title: "Repair pipe", category: "Plumbing", area: "Basement", description: "Quote received", workType: "repair work", estimatedCostMinor: 50000, currency: "USD" },
    });
    expect(client.rpc).toHaveBeenCalledWith("link_document_to_work_item", expect.objectContaining({
      new_category_name: "Plumbing and Water",
      new_work_type: "repair",
    }));
  });
});
