"use server";

import inspectionSeed from "../../seed-data/sample-property-inspection.json";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { InspectionEvidence, InspectionSeed, LocalWorkItem, ReviewActivity, ReviewStatus } from "@/lib/types";
import { databaseStatusToReview, reviewStatusToDatabase } from "@/lib/work-status";

const reviewUpdateSchema = z.object({
  workItemId: z.uuid(),
  reportId: z.string().min(1).max(160),
  status: z.enum(["needs_review", "open", "completed", "deferred", "not_applicable"]),
  note: z.string().trim().max(5000),
});

const manualWorkSchema = z.object({
  propertyId: z.uuid(),
  title: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(100),
  area: z.string().trim().min(1).max(120),
});

const magicLinkSchema = z.object({ email: z.email(), origin: z.url().optional() });
const evidenceRequestSchema = z.object({ workItemId: z.uuid() });

function requestSiteUrl(requestHeaders: Headers) {
  const origin = requestHeaders.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // Fall through to the forwarded host supplied by the deployment proxy.
    }
  }

  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"))
    ?.split(",")[0]
    .trim();
  if (!host) return null;

  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.startsWith("localhost")
      ? "http"
      : "https";

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

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

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) throw new Error("You must be signed in to update Houser.");
  return { supabase, userId: data.claims.sub };
}

export async function requestMagicLinkAction(input: { email: string; origin?: string }) {
  const { email, origin } = magicLinkSchema.parse(input);
  const normalizedEmail = email.toLowerCase();
  const allowedEmails = (process.env.HOUSER_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production" && allowedEmails.length === 0) {
    throw new Error("Houser sign-in is not configured yet.");
  }
  if (allowedEmails.length > 0 && !allowedEmails.includes(normalizedEmail)) {
    return { sent: true as const };
  }

  const requestHeaders = await headers();
  const requestOrigin = requestSiteUrl(requestHeaders);
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const submittedOrigin = origin ? new URL(origin).origin : null;
  const siteUrl = submittedOrigin ?? requestOrigin ?? configuredUrl ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${siteUrl.replace(/\/$/, "")}/auth/confirm?next=/`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    const rateLimited = error.message.toLowerCase().includes("rate limit");
    return {
      sent: false as const,
      error: rateLimited
        ? "Too many sign-in emails were requested. Please wait and try again later."
        : "The sign-in link could not be sent. Please try again.",
    };
  }
  return { sent: true as const };
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

  const [{ data: document, error: documentError }, { data: pageRows, error: pagesError }] = await Promise.all([
    supabase
      .from("documents")
      .select("storage_key,original_filename")
      .eq("id", workItem.source_document_id)
      .single(),
    supabase
      .from("document_pages")
      .select("page_number,preview_storage_key")
      .eq("document_id", workItem.source_document_id)
      .in("page_number", workItem.source_page_numbers ?? [])
      .order("page_number"),
  ]);
  if (documentError) throw new Error(documentError.message);
  if (pagesError) throw new Error(pagesError.message);

  const expiresInSeconds = 300;
  const { data: reportLink, error: reportLinkError } = await supabase.storage
    .from("inspection-documents")
    .createSignedUrl(document.storage_key, expiresInSeconds);
  if (reportLinkError) throw new Error(reportLinkError.message);

  const pages = await Promise.all(
    (pageRows ?? []).map(async (page) => {
      const { data: previewLink, error: previewLinkError } = await supabase.storage
        .from("inspection-documents")
        .createSignedUrl(page.preview_storage_key, expiresInSeconds);
      if (previewLinkError) throw new Error(previewLinkError.message);
      return {
        pageNumber: page.page_number,
        previewUrl: previewLink.signedUrl,
        reportUrl: `${reportLink.signedUrl}#page=${page.page_number}`,
      };
    }),
  );

  return {
    documentName: document.original_filename,
    pages,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
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

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
