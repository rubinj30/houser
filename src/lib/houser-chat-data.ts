import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { HouserChatSnapshot } from "@/lib/houser-chat";

function relatedName(value: unknown) {
  if (Array.isArray(value)) return typeof value[0]?.name === "string" ? value[0].name : null;
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") return value.name;
  return null;
}

export async function getHouserChatData() {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = typeof claimsResult?.claims?.sub === "string" ? claimsResult.claims.sub : null;
  if (claimsError || !userId) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("account_memberships")
    .select("account_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(`Could not load Houser membership: ${membershipError.message}`);
  if (!membership) return null;

  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id,display_name,property_type,timezone")
    .eq("account_id", membership.account_id)
    .eq("is_archived", false)
    .order("created_at");
  if (propertiesError) throw new Error(`Could not load Houser properties: ${propertiesError.message}`);
  if (!properties?.length) return null;

  const propertyIds = properties.map((property) => property.id);
  const propertyNames = new Map(properties.map((property) => [property.id, property.display_name]));
  const [workResult, assetResult, serviceResult, documentResult, activityResult] = await Promise.all([
    supabase
      .from("work_items")
      .select("id,property_id,source_key,source_section,title,description,work_type,status,priority,safety_flags,target_start_on,target_end_on,completed_at,estimated_cost_minor,currency,source_type,source_location,categories(name),areas(name),assets(name)")
      .in("property_id", propertyIds)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("assets")
      .select("id,property_id,name,asset_type,manufacturer,model,installed_on,installed_on_precision,expected_life_months,expected_life_source,condition,status,notes,categories(name),areas(name)")
      .in("property_id", propertyIds)
      .order("name"),
    supabase
      .from("service_records")
      .select("id,property_id,work_item_id,service_type,performed_on,description,vendor_name,cost_minor,currency,warranty_ends_on,recurrence_months,next_service_on,work_items!service_records_work_item_id_fkey(title)")
      .in("property_id", propertyIds)
      .order("performed_on", { ascending: false })
      .limit(200),
    supabase
      .from("documents")
      .select("id,property_id,document_type,original_filename,document_date,status")
      .in("property_id", propertyIds)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("activity_events")
      .select("id,property_id,work_item_id,event_type,status_from,status_to,note,created_at,work_items(title)")
      .in("property_id", propertyIds)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const failed = [workResult, assetResult, serviceResult, documentResult, activityResult].find((result) => result.error);
  if (failed?.error) throw new Error(`Could not prepare Houser chat data: ${failed.error.message}`);

  const workItems = (workResult.data ?? []).map((item) => ({
    id: item.id,
    reference: item.source_section ?? item.source_key ?? item.id,
    property: propertyNames.get(item.property_id) ?? "Unknown property",
    title: item.title,
    description: item.description,
    category: relatedName(item.categories),
    area: relatedName(item.areas),
    asset: relatedName(item.assets),
    location: item.source_location,
    workType: item.work_type,
    status: item.status,
    priority: item.priority,
    safetyFlags: item.safety_flags,
    targetStartOn: item.target_start_on,
    targetEndOn: item.target_end_on,
    completedAt: item.completed_at,
    estimatedCostMinor: item.estimated_cost_minor === null ? null : Number(item.estimated_cost_minor),
    currency: item.currency,
    sourceType: item.source_type,
  }));

  const snapshot: HouserChatSnapshot = {
    generatedAt: new Date().toISOString(),
    properties: properties.map((property) => ({
      id: property.id,
      name: property.display_name,
      type: property.property_type,
      timezone: property.timezone,
    })),
    workItems,
    assets: (assetResult.data ?? []).map((asset) => ({
      id: asset.id,
      property: propertyNames.get(asset.property_id) ?? "Unknown property",
      name: asset.name,
      type: asset.asset_type,
      category: relatedName(asset.categories),
      area: relatedName(asset.areas),
      manufacturer: asset.manufacturer,
      model: asset.model,
      installedOn: asset.installed_on,
      installedOnPrecision: asset.installed_on_precision,
      expectedLifeMonths: asset.expected_life_months,
      expectedLifeSource: asset.expected_life_source,
      condition: asset.condition,
      status: asset.status,
      notes: asset.notes,
    })),
    serviceRecords: (serviceResult.data ?? []).map((service) => ({
      id: service.id,
      property: propertyNames.get(service.property_id) ?? "Unknown property",
      workItemId: service.work_item_id,
      workItem: relatedName(service.work_items),
      serviceType: service.service_type,
      performedOn: service.performed_on,
      description: service.description,
      vendor: service.vendor_name,
      costMinor: service.cost_minor === null ? null : Number(service.cost_minor),
      currency: service.currency,
      warrantyEndsOn: service.warranty_ends_on,
      recurrenceMonths: service.recurrence_months,
      nextServiceOn: service.next_service_on,
    })),
    documents: (documentResult.data ?? []).map((document) => ({
      id: document.id,
      property: propertyNames.get(document.property_id) ?? "Unknown property",
      type: document.document_type,
      filename: document.original_filename,
      date: document.document_date,
      status: document.status,
    })),
    recentActivity: (activityResult.data ?? []).map((activity) => ({
      id: activity.id,
      property: propertyNames.get(activity.property_id) ?? "Unknown property",
      workItemId: activity.work_item_id,
      workItem: relatedName(activity.work_items),
      type: activity.event_type,
      statusFrom: activity.status_from,
      statusTo: activity.status_to,
      note: activity.note,
      createdAt: activity.created_at,
    })),
  };

  const workItemIndex = new Map(workItems.map((item) => [item.id, item]));
  return { userId, snapshot, workItemIndex };
}
