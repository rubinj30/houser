"use server";

import inspectionSeed from "../../seed-data/sample-property-inspection.json";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { InspectionEvidence, InspectionSeed, LinkedWorkDocument, LocalWorkItem, ReviewActivity, ReviewStatus, WorkCompletionInput, WorkCompletionResult } from "@/lib/types";
import { databaseStatusToReview, reviewStatusToDatabase } from "@/lib/work-status";

const reviewUpdateSchema = z.object({
  workItemId: z.uuid(),
  reportId: z.string().min(1).max(160),
  status: z.enum(["needs_review", "open", "completed", "deferred", "not_applicable"]),
  note: z.string().trim().max(5000),
});

const evidenceRequestSchema = z.object({ workItemId: z.uuid() });

const manualWorkSchema = z.object({
  propertyId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(100),
  area: z.string().trim().min(1).max(120),
});

const documentWorkDestinationSchema = z.discriminatedUnion("destination", [
  z.object({
    documentId: z.uuid(),
    destination: z.literal("existing"),
    existingWorkItemId: z.uuid(),
  }),
  z.object({
    documentId: z.uuid(),
    destination: z.literal("new"),
    title: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(100),
    area: z.string().trim().min(1).max(120),
    description: z.string().trim().max(5000),
    workType: z.string().trim().max(40),
    estimatedCostMinor: z.number().int().nonnegative().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const completionSchema = z.object({
  workItemId: z.uuid(),
  reportId: z.string().min(1).max(160),
  performedOn: dateSchema,
  vendorName: z.string().trim().max(200),
  cost: z.union([z.literal(""), z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places.")]),
  note: z.string().trim().max(5000),
  warrantyEndsOn: z.union([z.literal(""), dateSchema]),
  recurrenceMonths: z.number().int().min(1).max(1200).nullable(),
}).superRefine((value, context) => {
  if (value.warrantyEndsOn && value.warrantyEndsOn < value.performedOn) {
    context.addIssue({ code: "custom", path: ["warrantyEndsOn"], message: "Warranty end date must be after completion." });
  }
});

const magicLinkSchema = z.object({ email: z.email() });

const categoryAliases: Record<string, string> = {
  HVAC: "HVAC and Ventilation",
  Plumbing: "Plumbing and Water",
  Interior: "Interior and Finishes",
  "Structure and Water Management": "Structure and Foundation",
  Garage: "General",
};

function systemCategoryName(name: string) {
  return categoryAliases[name] ?? name;
}

function normalizeWorkType(value: string) {
  if (value.includes("replace")) return "replace";
  if (value.includes("repair")) return "repair";
  if (value.includes("maintain")) return "maintain";
  if (value.includes("improve")) return "improve";
  if (value.includes("monitor")) return "monitor";
  if (value.includes("inspect")) return "inspect";
  return "other";
}

function currencyToMinor(value: string) {
  if (!value) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) throw new Error("You must be signed in to update Houser.");
  return { supabase, userId: data.claims.sub };
}

export async function requestMagicLinkAction(input: { email: string }) {
  const { email } = magicLinkSchema.parse(input);
  const normalizedEmail = email.toLowerCase();
  const allowedEmails = (process.env.HOUSER_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production" && allowedEmails.length === 0) {
    throw new Error("Houser sign-in is not configured yet.");
  }
  if (allowedEmails.length > 0 && !allowedEmails.includes(normalizedEmail)) {
    return { sent: true };
  }

  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get("origin");
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const siteUrl = configuredUrl ?? requestOrigin ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${siteUrl.replace(/\/$/, "")}/auth/confirm?next=/`,
      shouldCreateUser: true,
    },
  });
  if (error) throw new Error(error.message);
  return { sent: true };
}

export async function bootstrapHouserAction() {
  const { supabase, userId } = await requireUser();
  const seed = inspectionSeed as InspectionSeed;
  const { data: accountId, error: bootstrapError } = await supabase.rpc("bootstrap_account", { account_name: "Houser" });
  if (bootstrapError || !accountId) throw new Error(bootstrapError?.message ?? "Could not create the Houser account.");

  const { data: existingProperty, error: propertyReadError } = await supabase
    .from("properties")
    .select("id")
    .eq("account_id", accountId)
    .eq("display_name", seed.property.displayName)
    .maybeSingle();
  if (propertyReadError) throw new Error(propertyReadError.message);

  let propertyId = existingProperty?.id as string | undefined;
  if (!propertyId) {
    const { data: createdProperty, error: propertyError } = await supabase
      .from("properties")
      .insert({
        account_id: accountId,
        display_name: seed.property.displayName,
        property_type: seed.property.kind,
        address_line1: seed.property.address.line1,
        city: seed.property.address.city,
        region: seed.property.address.region,
        postal_code: seed.property.address.postalCode,
        timezone: seed.property.timezone,
      })
      .select("id")
      .single();
    if (propertyError) throw new Error(propertyError.message);
    propertyId = createdProperty.id;
  }

  const { error: areasError } = await supabase
    .from("areas")
    .upsert(seed.areas.map((name) => ({ property_id: propertyId, name })), { onConflict: "property_id,name" });
  if (areasError) throw new Error(areasError.message);

  const [{ data: categories, error: categoriesError }, { data: areas, error: areaReadError }] = await Promise.all([
    supabase.from("categories").select("id,name").is("account_id", null),
    supabase.from("areas").select("id,name").eq("property_id", propertyId),
  ]);
  if (categoriesError) throw new Error(categoriesError.message);
  if (areaReadError) throw new Error(areaReadError.message);
  const categoryIds = new Map((categories ?? []).map((category) => [category.name, category.id]));
  const areaIds = new Map((areas ?? []).map((area) => [area.name, area.id]));

  const { error: assetsError } = await supabase.from("assets").upsert(
    seed.assets.map((asset) => ({
      property_id: propertyId,
      category_id: categoryIds.get(systemCategoryName(asset.category)) ?? categoryIds.get("General") ?? null,
      area_id: areaIds.get(asset.area) ?? null,
      source_key: asset.key,
      source_page_numbers: asset.sourcePages,
      name: asset.name,
      asset_type: asset.assetType,
      notes: asset.manufacturedYear ? `Manufactured ${asset.manufacturedYear} per inspection report.` : null,
    })),
    { onConflict: "property_id,source_key" },
  );
  if (assetsError) throw new Error(assetsError.message);

  const { data: assets, error: assetReadError } = await supabase
    .from("assets")
    .select("id,source_key")
    .eq("property_id", propertyId);
  if (assetReadError) throw new Error(assetReadError.message);
  const assetIds = new Map((assets ?? []).flatMap((asset) => asset.source_key ? [[asset.source_key, asset.id] as const] : []));

  const { error: workError } = await supabase.from("work_items").upsert(
    seed.findings.map((finding) => ({
      property_id: propertyId,
      category_id: categoryIds.get(systemCategoryName(finding.category)) ?? categoryIds.get("General") ?? null,
      area_id: areaIds.get(finding.area) ?? null,
      asset_id: finding.assetKey ? assetIds.get(finding.assetKey) ?? null : null,
      source_key: finding.reportId,
      title: finding.title,
      description: finding.suggestedAction,
      work_type: normalizeWorkType(finding.workType),
      status: "inbox",
      priority: finding.priority,
      safety_flags: finding.severity === "safety_hazard" ? ["life_safety"] : [],
      source_type: "inspection",
      source_location: finding.location,
      source_page_numbers: finding.sourcePages,
      source_document_name: seed.source.originalFilename,
      source_document_date: seed.source.documentDate,
      created_by: userId,
      updated_by: userId,
    })),
    { onConflict: "property_id,source_key", ignoreDuplicates: true },
  );
  if (workError) throw new Error(workError.message);

  revalidatePath("/");
  redirect("/");
}

export async function recordReviewUpdateAction(input: {
  workItemId: string;
  reportId: string;
  status: ReviewStatus;
  note: string;
}): Promise<{ status: ReviewStatus; activity: ReviewActivity }> {
  const values = reviewUpdateSchema.parse(input);
  const { supabase } = await requireUser();
  const databaseStatus = reviewStatusToDatabase[values.status];
  const { error: updateError } = await supabase.rpc("record_work_item_review", {
    target_work_item_id: values.workItemId,
    next_status: databaseStatus,
    review_note: values.note,
  });
  if (updateError) throw new Error(updateError.message);

  const { data: event, error: eventError } = await supabase
    .from("activity_events")
    .select("id,status_to,note,created_at")
    .eq("work_item_id", values.workItemId)
    .eq("event_type", "status_change")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/");
  return {
    status: databaseStatusToReview(event.status_to),
    activity: {
      id: event.id,
      reportId: values.reportId,
      status: databaseStatusToReview(event.status_to),
      note: event.note ?? "",
      createdAt: event.created_at,
    },
  };
}

export async function getInspectionEvidenceAction(input: { workItemId: string }): Promise<InspectionEvidence | null> {
  const { workItemId } = evidenceRequestSchema.parse(input);
  const { supabase } = await requireUser();
  const { data: workItem, error: workItemError } = await supabase
    .from("work_items")
    .select("source_document_id,source_page_numbers")
    .eq("id", workItemId)
    .single();
  if (workItemError) throw new Error(workItemError.message);
  if (!workItem.source_document_id) return null;

  const rawSourcePages: unknown[] = Array.isArray(workItem.source_page_numbers) ? workItem.source_page_numbers : [];
  const validSourcePages: number[] = rawSourcePages.filter(
    (page: unknown): page is number => typeof page === "number" && Number.isInteger(page) && page > 0,
  );
  const sourcePages = [...new Set<number>(validSourcePages)].sort((a, b) => a - b);
  const documentQuery = supabase
    .from("documents")
    .select("storage_key,storage_bucket,original_filename")
    .eq("id", workItem.source_document_id)
    .single();
  const pagesQuery = sourcePages.length
    ? supabase
        .from("document_pages")
        .select("page_number,preview_storage_key")
        .eq("document_id", workItem.source_document_id)
        .in("page_number", sourcePages)
        .order("page_number")
    : Promise.resolve({ data: [], error: null });

  const [{ data: document, error: documentError }, { data: pageRows, error: pagesError }] = await Promise.all([documentQuery, pagesQuery]);
  if (documentError) throw new Error(documentError.message);
  if (pagesError) throw new Error(pagesError.message);

  const expiresInSeconds = 300;
  const reportBucket = document.storage_bucket ?? "documents";
  const { data: reportLink, error: reportLinkError } = await supabase.storage
    .from(reportBucket)
    .createSignedUrl(document.storage_key, expiresInSeconds);
  if (reportLinkError || !reportLink?.signedUrl) throw new Error(reportLinkError?.message ?? "The private report could not be opened.");

  const previewByPage = new Map((pageRows ?? []).map((page) => [page.page_number, page.preview_storage_key]));
  const pages = await Promise.all(sourcePages.map(async (pageNumber) => {
    const previewKey = previewByPage.get(pageNumber);
    let previewUrl: string | null = null;
    if (previewKey) {
      const { data: previewLink, error: previewLinkError } = await supabase.storage
        .from("inspection-documents")
        .createSignedUrl(previewKey, expiresInSeconds);
      if (previewLinkError) throw new Error(previewLinkError.message);
      previewUrl = previewLink.signedUrl;
    }
    return {
      pageNumber,
      previewUrl,
      reportUrl: `${reportLink.signedUrl}#page=${pageNumber}`,
    };
  }));

  return {
    documentName: document.original_filename,
    pages,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}

export async function completeWorkItemAction(input: WorkCompletionInput): Promise<WorkCompletionResult> {
  const values = completionSchema.parse(input);
  const { supabase } = await requireUser();
  const { data: completion, error: completionError } = await supabase.rpc("complete_work_item", {
    target_work_item_id: values.workItemId,
    service_performed_on: values.performedOn,
    service_vendor_name: values.vendorName || null,
    service_cost_minor: currencyToMinor(values.cost),
    service_note: values.note || null,
    service_warranty_ends_on: values.warrantyEndsOn || null,
    next_recurrence_months: values.recurrenceMonths,
  });
  if (completionError) throw new Error(completionError.message);

  const result = completion as { service_record_id?: string; next_service_on?: string } | null;
  if (!result?.service_record_id) throw new Error("The completion was saved without a service record identifier.");

  const [{ data: serviceRecord, error: serviceError }, { data: event, error: eventError }] = await Promise.all([
    supabase
      .from("service_records")
      .select("id,performed_on,description,vendor_name,cost_minor,currency,warranty_ends_on,recurrence_months,next_service_on")
      .eq("id", result.service_record_id)
      .single(),
    supabase
      .from("activity_events")
      .select("id,status_to,note,created_at")
      .eq("work_item_id", values.workItemId)
      .eq("event_type", "service_recorded")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);
  if (serviceError) throw new Error(serviceError.message);
  if (eventError) throw new Error(eventError.message);

  revalidatePath("/");
  return {
    status: "completed",
    activity: {
      id: event.id,
      reportId: values.reportId,
      status: databaseStatusToReview(event.status_to),
      note: event.note ?? "",
      createdAt: event.created_at,
    },
    serviceRecord: {
      id: serviceRecord.id,
      reportId: values.reportId,
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

export async function createManualWorkItemAction(input: {
  propertyId: string;
  title: string;
  category: string;
  area: string;
}): Promise<LocalWorkItem> {
  const values = manualWorkSchema.parse(input);
  const { supabase, userId } = await requireUser();
  const [{ data: category }, { data: area }] = await Promise.all([
    supabase.from("categories").select("id,name").eq("name", systemCategoryName(values.category)).limit(1).maybeSingle(),
    supabase.from("areas").select("id,name").eq("property_id", values.propertyId).eq("name", values.area).maybeSingle(),
  ]);
  const reportId = `manual-${crypto.randomUUID()}`;
  const description = "Review this manually added work item and add scheduling details.";
  const { data: workItem, error } = await supabase
    .from("work_items")
    .insert({
      property_id: values.propertyId,
      category_id: category?.id ?? null,
      area_id: area?.id ?? null,
      source_key: reportId,
      title: values.title,
      description,
      work_type: "other",
      status: "inbox",
      priority: "routine",
      source_type: "manual",
      source_location: values.area,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  return {
    workItemId: workItem.id,
    reportId,
    title: values.title,
    category: values.category,
    area: values.area,
    workType: "other",
    severity: "recommendation",
    priority: "routine",
    location: values.area,
    suggestedAction: description,
    sourcePages: [],
    isLocal: true,
  } satisfies LocalWorkItem;
}

export async function saveDocumentWorkDestinationAction(input: z.input<typeof documentWorkDestinationSchema>) {
  const values = documentWorkDestinationSchema.parse(input);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("link_document_to_work_item", {
    target_document_id: values.documentId,
    target_work_item_id: values.destination === "existing" ? values.existingWorkItemId : null,
    new_title: values.destination === "new" ? values.title : null,
    new_category_name: values.destination === "new" ? systemCategoryName(values.category) : null,
    new_area_name: values.destination === "new" ? values.area : null,
    new_description: values.destination === "new" ? values.description : null,
    new_work_type: values.destination === "new" ? normalizeWorkType(values.workType) : "other",
    new_estimated_cost_minor: values.destination === "new" ? values.estimatedCostMinor : null,
    new_currency: values.destination === "new" ? values.currency : "USD",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/");
  return { workItemId: data as string };
}

export async function getLinkedWorkDocumentsAction(input: { workItemId: string }): Promise<LinkedWorkDocument[]> {
  const values = evidenceRequestSchema.parse(input);
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("document_links")
    .select("relationship,documents(id,document_type,original_filename,document_date)")
    .eq("work_item_id", values.workItemId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const related = Array.isArray(row.documents) ? row.documents[0] : row.documents;
    if (!related) return [];
    return [{
      id: related.id,
      documentType: related.document_type,
      filename: related.original_filename,
      documentDate: related.document_date,
      relationship: row.relationship as LinkedWorkDocument["relationship"],
    }];
  });
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
