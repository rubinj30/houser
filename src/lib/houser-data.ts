import "server-only";

import inspectionSeed from "../../seed-data/sample-property-inspection.json";
import { createClient } from "@/lib/supabase/server";
import type { Finding, HouserWorkspace, InspectionSeed, ReviewActivity, ReviewStatus, ServiceRecord } from "@/lib/types";
import { databaseStatusToReview } from "@/lib/work-status";

type WorkItemRow = {
  id: string;
  source_key: string | null;
  title: string;
  description: string | null;
  work_type: string;
  status: string;
  priority: Finding["priority"];
  source_location: string | null;
  source_page_numbers: number[] | null;
  source_document_id: string | null;
  source_section: string | null;
  source_category: string | null;
  source_severity: Finding["severity"] | null;
  source_excerpt: string | null;
  target_start_on: string | null;
  target_end_on: string | null;
  categories: { name: string } | { name: string }[] | null;
  areas: { name: string } | { name: string }[] | null;
};

type ActivityRow = {
  id: string;
  status_to: string | null;
  note: string | null;
  created_at: string;
  work_items: { source_key: string | null; source_section: string | null } | { source_key: string | null; source_section: string | null }[] | null;
};

type ServiceRecordRow = {
  id: string;
  performed_on: string;
  description: string;
  vendor_name: string | null;
  cost_minor: number | string | null;
  currency: string;
  warranty_ends_on: string | null;
  recurrence_months: number | null;
  next_service_on: string | null;
  work_items: { source_key: string | null; source_section: string | null } | { source_key: string | null; source_section: string | null }[] | null;
};

function relatedName(value: WorkItemRow["categories"] | WorkItemRow["areas"], fallback: string) {
  if (Array.isArray(value)) return value[0]?.name ?? fallback;
  return value?.name ?? fallback;
}

function relatedSourceKey(value: ActivityRow["work_items"]) {
  if (Array.isArray(value)) return value[0]?.source_section ?? value[0]?.source_key ?? null;
  return value?.source_section ?? value?.source_key ?? null;
}

function databaseFinding(row: WorkItemRow): Finding {
  const area = relatedName(row.areas, row.source_location ?? "General");
  return {
    workItemId: row.id,
    reportId: row.source_section ?? row.source_key ?? `manual-${row.id}`,
    title: row.title,
    category: row.source_category ?? relatedName(row.categories, "General"),
    area,
    workType: row.work_type,
    severity: row.source_severity ?? "recommendation",
    priority: row.priority,
    location: row.source_location ?? area,
    suggestedAction: row.description ?? "Review this work item and add scheduling details.",
    sourcePages: row.source_page_numbers ?? [],
    sourceDocumentId: row.source_document_id ?? undefined,
    sourceExcerpt: row.source_excerpt ?? undefined,
    targetStartOn: row.target_start_on,
    targetEndOn: row.target_end_on,
  };
}

export async function getAuthenticatedEmail() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return typeof data.claims.email === "string" ? data.claims.email : "Signed-in owner";
}

export async function getHouserWorkspace(): Promise<HouserWorkspace | null> {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsResult?.claims;
  if (claimsError || !claims?.sub) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("account_memberships")
    .select("account_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error(`Could not load Houser membership: ${membershipError.message}`);
  if (!membership) return null;

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id")
    .eq("account_id", membership.account_id)
    .eq("is_archived", false)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (propertyError) throw new Error(`Could not load Houser property: ${propertyError.message}`);
  if (!property) return null;

  const [
    { data: workItems, error: workItemsError },
    { data: activities, error: activitiesError },
    { data: services, error: servicesError },
  ] = await Promise.all([
    supabase
      .from("work_items")
      .select("id, source_key, title, description, work_type, status, priority, target_start_on, target_end_on, source_location, source_page_numbers, source_document_id, source_section, source_category, source_severity, source_excerpt, categories(name), areas(name)")
      .eq("property_id", property.id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("activity_events")
      .select("id, status_to, note, created_at, work_items(source_key,source_section)")
      .eq("property_id", property.id)
      .in("event_type", ["status_change", "service_recorded"])
      .order("created_at", { ascending: false }),
    supabase
      .from("service_records")
      .select("id, performed_on, description, vendor_name, cost_minor, currency, warranty_ends_on, recurrence_months, next_service_on, work_items!service_records_work_item_id_fkey(source_key,source_section)")
      .eq("property_id", property.id)
      .order("performed_on", { ascending: false }),
  ]);

  if (workItemsError) throw new Error(`Could not load Houser work: ${workItemsError.message}`);
  if (activitiesError) throw new Error(`Could not load Houser activity: ${activitiesError.message}`);
  if (servicesError) throw new Error(`Could not load Houser service history: ${servicesError.message}`);

  const seed = inspectionSeed as InspectionSeed;
  const rows = (workItems ?? []) as WorkItemRow[];
  const findings = rows.map(databaseFinding);
  const reviewStatuses = Object.fromEntries(
    rows.map((row) => [row.source_section ?? row.source_key ?? `manual-${row.id}`, databaseStatusToReview(row.status)]),
  ) as Record<string, ReviewStatus>;
  const reviewActivities = ((activities ?? []) as ActivityRow[]).flatMap<ReviewActivity>((activity) => {
    const sourceKey = relatedSourceKey(activity.work_items);
    if (!sourceKey || !activity.status_to) return [];
    return [{
      id: activity.id,
      reportId: sourceKey,
      status: databaseStatusToReview(activity.status_to),
      note: activity.note ?? "",
      createdAt: activity.created_at,
    }];
  });
  const serviceRecords = ((services ?? []) as ServiceRecordRow[]).flatMap<ServiceRecord>((service) => {
    const sourceKey = relatedSourceKey(service.work_items);
    if (!sourceKey) return [];
    return [{
      id: service.id,
      reportId: sourceKey,
      performedOn: service.performed_on,
      description: service.description,
      vendorName: service.vendor_name,
      costMinor: service.cost_minor === null ? null : Number(service.cost_minor),
      currency: service.currency,
      warrantyEndsOn: service.warranty_ends_on,
      recurrenceMonths: service.recurrence_months,
      nextServiceOn: service.next_service_on,
    }];
  });

  return {
    accountId: membership.account_id,
    propertyId: property.id,
    userEmail: typeof claims.email === "string" ? claims.email : "Signed-in owner",
    seed: { ...seed, findings },
    findings,
    reviewStatuses,
    reviewActivities,
    serviceRecords,
  };
}
