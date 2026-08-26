import "server-only";

import inspectionSeed from "../../seed-data/sample-property-inspection.json";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Finding, HouserWorkspace, InspectionSeed, PropertySummary, ReviewActivity, ReviewStatus, ServiceRecord } from "@/lib/types";
import { databaseStatusToReview } from "@/lib/work-status";

type WorkItemRow = {
  id: string;
  property_id: string;
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
  property_id: string;
  work_item_id: string | null;
  created_by: string;
  status_to: string | null;
  note: string | null;
  created_at: string;
  work_items: { source_key: string | null; source_section: string | null } | { source_key: string | null; source_section: string | null }[] | null;
};

type ServiceRecordRow = {
  id: string;
  property_id: string;
  work_item_id: string | null;
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

function databaseFinding(row: WorkItemRow, propertyNames: Map<string, string>, allProperties: boolean): Finding {
  const area = relatedName(row.areas, row.source_location ?? "General");
  const sourceReference = row.source_section ?? row.source_key ?? `manual-${row.id}`;
  return {
    propertyId: row.property_id,
    propertyName: propertyNames.get(row.property_id) ?? "Unknown property",
    workItemId: row.id,
    reportId: allProperties ? `${row.property_id}:${sourceReference}` : sourceReference,
    sourceReference,
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

export async function getHouserWorkspace(requestedPropertyId?: string): Promise<HouserWorkspace | null> {
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

  const { data: properties, error: propertyError } = await supabase
    .from("properties")
    .select("id,display_name,property_type,address_line1,city,region,postal_code,timezone")
    .eq("account_id", membership.account_id)
    .eq("is_archived", false)
    .order("created_at");

  if (propertyError) throw new Error(`Could not load Houser property: ${propertyError.message}`);
  if (!properties?.length) return null;

  const propertySummaries: PropertySummary[] = properties.map((property) => ({
    id: property.id,
    displayName: property.display_name,
    propertyType: property.property_type,
    address: [property.address_line1, property.city, property.region, property.postal_code].filter(Boolean).join(", "),
    timezone: property.timezone,
  }));
  const cookieStore = await cookies();
  const rememberedPropertyId = cookieStore.get("houser_property")?.value;
  const candidate = requestedPropertyId ?? rememberedPropertyId ?? properties[0].id;
  const selectedPropertyId: string | "all" = candidate === "all" && properties.length > 1
    ? "all"
    : properties.some((property) => property.id === candidate)
      ? candidate
      : properties[0].id;
  const selectedProperty = selectedPropertyId === "all" ? null : properties.find((property) => property.id === selectedPropertyId)!;
  const propertyIds = selectedPropertyId === "all" ? properties.map((property) => property.id) : [selectedPropertyId];
  const propertyNames = new Map(properties.map((property) => [property.id, property.display_name]));

  const [
    { data: workItems, error: workItemsError },
    { data: activities, error: activitiesError },
    { data: services, error: servicesError },
    { data: inspectionDocument, error: inspectionDocumentError },
  ] = await Promise.all([
    supabase
      .from("work_items")
      .select("id, property_id, source_key, title, description, work_type, status, priority, target_start_on, target_end_on, source_location, source_page_numbers, source_document_id, source_section, source_category, source_severity, source_excerpt, categories(name), areas(name)")
      .in("property_id", propertyIds)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("activity_events")
      .select("id, property_id, work_item_id, created_by, status_to, note, created_at, work_items(source_key,source_section)")
      .in("property_id", propertyIds)
      .in("event_type", ["status_change", "service_recorded"])
      .order("created_at", { ascending: false }),
    supabase
      .from("service_records")
      .select("id, property_id, work_item_id, performed_on, description, vendor_name, cost_minor, currency, warranty_ends_on, recurrence_months, next_service_on, work_items!service_records_work_item_id_fkey(source_key,source_section)")
      .in("property_id", propertyIds)
      .order("performed_on", { ascending: false }),
    supabase
      .from("documents")
      .select("id")
      .in("property_id", propertyIds)
      .eq("document_type", "inspection")
      .neq("status", "failed")
      .limit(1),
  ]);

  if (workItemsError) throw new Error(`Could not load Houser work: ${workItemsError.message}`);
  if (activitiesError) throw new Error(`Could not load Houser activity: ${activitiesError.message}`);
  if (servicesError) throw new Error(`Could not load Houser service history: ${servicesError.message}`);
  if (inspectionDocumentError) throw new Error(`Could not load Houser inspection document: ${inspectionDocumentError.message}`);

  const seed = inspectionSeed as InspectionSeed;
  const rows = (workItems ?? []) as WorkItemRow[];
  const allProperties = selectedPropertyId === "all";
  const findings = rows.map((row) => databaseFinding(row, propertyNames, allProperties));
  const reportIdByWorkItemId = new Map(findings.flatMap((finding) => finding.workItemId ? [[finding.workItemId, finding.reportId] as const] : []));
  const reviewStatuses = Object.fromEntries(
    rows.map((row) => [reportIdByWorkItemId.get(row.id) ?? row.id, databaseStatusToReview(row.status)]),
  ) as Record<string, ReviewStatus>;
  const actorIds = [...new Set(((activities ?? []) as ActivityRow[]).map((activity) => activity.created_by))];
  const { data: actorProfiles, error: actorProfilesError } = actorIds.length
    ? await supabase.from("profiles").select("id,display_name,email").in("id", actorIds)
    : { data: [], error: null };
  if (actorProfilesError) throw new Error(`Could not load activity authors: ${actorProfilesError.message}`);
  const actorById = new Map((actorProfiles ?? []).map((profile) => [profile.id, profile]));
  const reviewActivities = ((activities ?? []) as ActivityRow[]).flatMap<ReviewActivity>((activity) => {
    const sourceKey = activity.work_item_id ? reportIdByWorkItemId.get(activity.work_item_id) : null;
    if (!sourceKey || !activity.status_to) return [];
    const actor = actorById.get(activity.created_by);
    return [{
      id: activity.id,
      reportId: sourceKey,
      status: databaseStatusToReview(activity.status_to),
      note: activity.note ?? "",
      createdAt: activity.created_at,
      actorName: actor?.display_name ?? null,
      actorEmail: actor?.email ?? null,
    }];
  });
  const serviceRecords = ((services ?? []) as ServiceRecordRow[]).flatMap<ServiceRecord>((service) => {
    const sourceKey = service.work_item_id ? reportIdByWorkItemId.get(service.work_item_id) : null;
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

  const databaseProperty = selectedProperty ?? properties[0];
  const workspaceSeed: InspectionSeed = {
    ...seed,
    property: selectedPropertyId === "all" ? {
      ...seed.property,
      displayName: "All properties",
      kind: "household",
      address: { line1: "", city: "", region: "", postalCode: "" },
      timezone: databaseProperty.timezone,
    } : {
      ...seed.property,
      displayName: databaseProperty.display_name,
      kind: databaseProperty.property_type,
      address: {
        line1: databaseProperty.address_line1 ?? "",
        city: databaseProperty.city ?? "",
        region: databaseProperty.region ?? "",
        postalCode: databaseProperty.postal_code ?? "",
      },
      timezone: databaseProperty.timezone,
    },
    findings,
  };

  return {
    accountId: membership.account_id,
    propertyId: selectedPropertyId === "all" ? null : selectedPropertyId,
    selectedPropertyId,
    properties: propertySummaries,
    userEmail: typeof claims.email === "string" ? claims.email : "Signed-in owner",
    hasInspectionDocument: Boolean(inspectionDocument?.length),
    seed: workspaceSeed,
    findings,
    reviewStatuses,
    reviewActivities,
    serviceRecords,
  };
}
