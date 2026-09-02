import "server-only";

import type { HouserChatAction } from "@/lib/houser-chat";
import { createClient } from "@/lib/supabase/server";
import type { LocalWorkItem, ReviewActivity, ReviewStatus, WorkCompletionInput, WorkCompletionResult } from "@/lib/types";
import { databaseStatusToReview, reviewStatusToDatabase } from "@/lib/work-status";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type PlannedWorkItem = {
  id: string;
  propertyId: string;
  reference: string;
  title: string;
  description: string | null;
  category: string | null;
  area: string | null;
  status: string;
  priority: string;
  workType: string;
  targetStartOn: string | null;
  targetEndOn: string | null;
  updatedAt: string;
};

const categoryAliases: Record<string, string> = {
  HVAC: "HVAC and Ventilation",
  Plumbing: "Plumbing and Water",
  Interior: "Interior and Finishes",
  "Structure and Water Management": "Structure and Foundation",
  Garage: "General",
};

export function normalizeWorkCategory(name: string) {
  return categoryAliases[name] ?? name;
}

export function normalizeWorkType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("replace")) return "replace";
  if (normalized.includes("repair")) return "repair";
  if (normalized.includes("maintain")) return "maintain";
  if (normalized.includes("improve")) return "improve";
  if (normalized.includes("monitor")) return "monitor";
  if (normalized.includes("inspect")) return "inspect";
  return "other";
}

export function currencyToMinor(value: string) {
  if (!value) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

async function planWorkItem(supabase: SupabaseClient, parameters: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("plan_work_item", parameters);
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Work planning did not return the saved Work item.");
  return data as PlannedWorkItem;
}

export async function createManualWorkItem(
  supabase: SupabaseClient,
  input: { propertyId: string; title: string; description: string; category: string; area: string },
): Promise<LocalWorkItem> {
  const description = input.description || "Review this manually added work item and add scheduling details.";
  const saved = await planWorkItem(supabase, {
    target_property_id: input.propertyId,
    new_source_type: "manual",
    new_title: input.title,
    new_description: description,
    new_category_name: normalizeWorkCategory(input.category),
    new_area_name: input.area,
    new_work_type: "other",
    new_status: "inbox",
    new_priority: "routine",
    activity_note: "Created from quick capture.",
  });
  return {
    workItemId: saved.id,
    propertyId: saved.propertyId,
    reportId: saved.reference,
    title: saved.title,
    category: input.category,
    area: input.area,
    workType: saved.workType,
    severity: "recommendation",
    priority: "routine",
    location: input.area,
    suggestedAction: description,
    sourcePages: [],
    isLocal: true,
  };
}

export async function createChatWorkItem(
  supabase: SupabaseClient,
  action: Extract<HouserChatAction, { type: "create_work_item" }>,
) {
  return planWorkItem(supabase, {
    target_property_id: action.propertyId,
    new_source_type: "chat",
    new_title: action.title,
    new_description: action.description,
    new_category_name: normalizeWorkCategory(action.category),
    new_area_name: action.area,
    new_work_type: action.workType,
    new_status: action.status,
    new_priority: action.priority,
    new_target_start_on: action.targetStartOn,
    new_target_end_on: action.targetEndOn,
    activity_note: action.note || "Created from Ask Houser after owner confirmation.",
  });
}

export async function updateChatWorkItem(
  supabase: SupabaseClient,
  action: Extract<HouserChatAction, { type: "update_work_item" }>,
) {
  return planWorkItem(supabase, {
    target_work_item_id: action.workItemId,
    expected_updated_at: action.expectedUpdatedAt,
    new_source_type: "chat",
    new_title: action.title,
    new_description: action.description,
    new_category_name: action.category ? normalizeWorkCategory(action.category) : null,
    new_area_name: action.area,
    new_work_type: action.workType,
    new_status: action.status,
    new_priority: action.priority,
    new_target_start_on: action.targetStartOn,
    new_target_end_on: action.targetEndOn,
    activity_note: action.note || action.summary,
  });
}

export async function recordWorkItemReview(
  supabase: SupabaseClient,
  input: { workItemId: string; reportId: string; status: ReviewStatus; note: string },
): Promise<{ status: ReviewStatus; activity: ReviewActivity }> {
  const { error: updateError } = await supabase.rpc("record_work_item_review", {
    target_work_item_id: input.workItemId,
    next_status: reviewStatusToDatabase[input.status],
    review_note: input.note,
  });
  if (updateError) throw new Error(updateError.message);

  const { data: event, error: eventError } = await supabase
    .from("activity_events")
    .select("id,status_to,note,created_at")
    .eq("work_item_id", input.workItemId)
    .eq("event_type", "status_change")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (eventError) throw new Error(eventError.message);
  return {
    status: databaseStatusToReview(event.status_to),
    activity: {
      id: event.id,
      reportId: input.reportId,
      status: databaseStatusToReview(event.status_to),
      note: event.note ?? "",
      createdAt: event.created_at,
    },
  };
}

export async function completePlannedWorkItem(
  supabase: SupabaseClient,
  input: WorkCompletionInput,
): Promise<WorkCompletionResult> {
  const { data: completion, error: completionError } = await supabase.rpc("complete_work_item", {
    target_work_item_id: input.workItemId,
    service_performed_on: input.performedOn,
    service_vendor_name: input.vendorName || null,
    service_cost_minor: currencyToMinor(input.cost),
    service_note: input.note || null,
    service_warranty_ends_on: input.warrantyEndsOn || null,
    next_recurrence_months: input.recurrenceMonths,
  });
  if (completionError) throw new Error(completionError.message);
  const result = completion as { service_record_id?: string } | null;
  if (!result?.service_record_id) throw new Error("The completion was saved without a service record identifier.");

  const [{ data: serviceRecord, error: serviceError }, { data: event, error: eventError }] = await Promise.all([
    supabase.from("service_records").select("id,performed_on,description,vendor_name,cost_minor,currency,warranty_ends_on,recurrence_months,next_service_on").eq("id", result.service_record_id).single(),
    supabase.from("activity_events").select("id,status_to,note,created_at").eq("work_item_id", input.workItemId).eq("event_type", "service_recorded").order("created_at", { ascending: false }).limit(1).single(),
  ]);
  if (serviceError) throw new Error(serviceError.message);
  if (eventError) throw new Error(eventError.message);
  return {
    status: "completed",
    activity: { id: event.id, reportId: input.reportId, status: databaseStatusToReview(event.status_to), note: event.note ?? "", createdAt: event.created_at },
    serviceRecord: {
      id: serviceRecord.id,
      reportId: input.reportId,
      performedOn: serviceRecord.performed_on,
      description: serviceRecord.description,
      vendorName: serviceRecord.vendor_name,
      costMinor: serviceRecord.cost_minor === null ? null : Number(serviceRecord.cost_minor),
      currency: serviceRecord.currency,
      warrantyEndsOn: serviceRecord.warranty_ends_on,
      recurrenceMonths: serviceRecord.recurrence_months,
      nextServiceOn: serviceRecord.next_service_on,
    },
    nextServiceOn: serviceRecord.next_service_on,
  };
}

export async function linkDocumentToWorkItem(
  supabase: SupabaseClient,
  input: {
    documentId: string;
    existingWorkItemId?: string;
    newWork?: { title: string; category: string; area: string; description: string; workType: string; estimatedCostMinor: number | null; currency: string };
  },
) {
  const { data, error } = await supabase.rpc("link_document_to_work_item", {
    target_document_id: input.documentId,
    target_work_item_id: input.existingWorkItemId ?? null,
    new_title: input.newWork?.title ?? null,
    new_category_name: input.newWork ? normalizeWorkCategory(input.newWork.category) : null,
    new_area_name: input.newWork?.area ?? null,
    new_description: input.newWork?.description ?? null,
    new_work_type: input.newWork ? normalizeWorkType(input.newWork.workType) : "other",
    new_estimated_cost_minor: input.newWork?.estimatedCostMinor ?? null,
    new_currency: input.newWork?.currency ?? "USD",
  });
  if (error) throw new Error(error.message);
  return { workItemId: data as string };
}
