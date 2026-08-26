import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { houserChatActionSchema, type HouserChatAction } from "@/lib/houser-chat";
import { createClient } from "@/lib/supabase/server";

const categoryAliases: Record<string, string> = {
  HVAC: "HVAC and Ventilation",
  Plumbing: "Plumbing and Water",
  Interior: "Interior and Finishes",
  "Structure and Water Management": "Structure and Foundation",
  Garage: "General",
};

function categoryName(value: string) {
  return categoryAliases[value] ?? value;
}

function relatedName(value: unknown) {
  if (Array.isArray(value)) return typeof value[0]?.name === "string" ? value[0].name : null;
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") return value.name;
  return null;
}

async function resolveCategoryAndArea(
  supabase: Awaited<ReturnType<typeof createClient>>,
  propertyId: string,
  category: string | null,
  area: string | null,
) {
  const [{ data: categoryRow, error: categoryError }, { data: areaRow, error: areaError }] = await Promise.all([
    category
      ? supabase.from("categories").select("id").eq("name", categoryName(category)).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    area
      ? supabase.from("areas").select("id").eq("property_id", propertyId).eq("name", area).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (categoryError) throw categoryError;
  if (areaError) throw areaError;

  let areaId = areaRow?.id ?? null;
  if (area && !areaId) {
    const { data: createdArea, error } = await supabase.from("areas").insert({ property_id: propertyId, name: area }).select("id").single();
    if (error) throw error;
    areaId = createdArea.id;
  }
  return { categoryId: categoryRow?.id ?? null, areaId };
}

function workResponse(row: Record<string, unknown>) {
  return {
    id: row.id,
    reference: row.source_section ?? row.source_key ?? row.id,
    title: row.title,
    category: relatedName(row.categories),
    area: relatedName(row.areas),
    status: row.status,
    priority: row.priority,
    targetStartOn: row.target_start_on,
    targetEndOn: row.target_end_on,
  };
}

async function createWorkItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: Extract<HouserChatAction, { type: "create_work_item" }>,
) {
  const { data: property, error: propertyError } = await supabase.from("properties").select("id").eq("id", action.propertyId).maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) throw new Error("That property is not available.");
  const { categoryId, areaId } = await resolveCategoryAndArea(supabase, property.id, action.category, action.area);
  const sourceKey = `chat-${crypto.randomUUID()}`;
  const { data: row, error } = await supabase.from("work_items").insert({
    property_id: property.id,
    category_id: categoryId,
    area_id: areaId,
    source_key: sourceKey,
    title: action.title,
    description: action.description,
    work_type: action.workType,
    status: action.status,
    priority: action.priority,
    target_start_on: action.targetStartOn,
    target_end_on: action.targetEndOn,
    source_type: "chat",
    source_location: action.area,
    completed_at: action.status === "completed" ? new Date().toISOString() : null,
    created_by: userId,
    updated_by: userId,
  }).select("id,source_key,source_section,title,status,priority,target_start_on,target_end_on,categories(name),areas(name)").single();
  if (error) throw error;

  const { error: activityError } = await supabase.from("activity_events").insert({
    property_id: property.id,
    work_item_id: row.id,
    event_type: "created",
    status_to: action.status,
    note: action.note || "Created from Ask Houser after owner confirmation.",
    metadata: { source: "chat" },
    created_by: userId,
  });
  if (activityError) throw activityError;
  return workResponse(row);
}

async function updateWorkItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: Extract<HouserChatAction, { type: "update_work_item" }>,
) {
  const { data: current, error: currentError } = await supabase.from("work_items")
    .select("id,property_id,status,updated_at")
    .eq("id", action.workItemId)
    .is("archived_at", null)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("That work item is no longer available.");
  if (current.updated_at !== action.expectedUpdatedAt) throw new Error("That work item changed since this proposal was prepared. Ask Houser to review it again.");

  const { categoryId, areaId } = await resolveCategoryAndArea(supabase, current.property_id, action.category, action.area);
  const changes: Record<string, unknown> = { updated_by: userId };
  if (action.title !== null) changes.title = action.title;
  if (action.description !== null) changes.description = action.description;
  if (action.category !== null) changes.category_id = categoryId;
  if (action.area !== null) {
    changes.area_id = areaId;
    changes.source_location = action.area;
  }
  if (action.workType !== null) changes.work_type = action.workType;
  if (action.status !== null) {
    changes.status = action.status;
    changes.completed_at = action.status === "completed" ? new Date().toISOString() : null;
  }
  if (action.priority !== null) changes.priority = action.priority;
  if (action.targetStartOn !== null) changes.target_start_on = action.targetStartOn;
  if (action.targetEndOn !== null) changes.target_end_on = action.targetEndOn;

  const { data: row, error } = await supabase.from("work_items").update(changes)
    .eq("id", current.id)
    .eq("updated_at", action.expectedUpdatedAt)
    .select("id,source_key,source_section,title,status,priority,target_start_on,target_end_on,categories(name),areas(name)")
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("That work item changed before the update was saved. Ask Houser to try again.");

  const statusChanged = action.status !== null && action.status !== current.status;
  const { error: activityError } = await supabase.from("activity_events").insert({
    property_id: current.property_id,
    work_item_id: current.id,
    event_type: statusChanged ? "status_change" : "edited",
    status_from: statusChanged ? current.status : null,
    status_to: statusChanged ? action.status : null,
    note: action.note || action.summary,
    metadata: { source: "chat" },
    created_by: userId,
  });
  if (activityError) throw activityError;
  return workResponse(row);
}

export async function POST(request: Request) {
  const parsed = houserChatActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "This proposed change is no longer valid. Ask Houser to prepare it again." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (authError || !userId) return NextResponse.json({ error: "Sign in to update Houser." }, { status: 401 });

  try {
    const workItem = parsed.data.type === "create_work_item"
      ? await createWorkItem(supabase, userId, parsed.data)
      : await updateWorkItem(supabase, userId, parsed.data);
    revalidatePath("/");
    revalidatePath("/chat");
    return NextResponse.json({ message: parsed.data.type === "create_work_item" ? "Work item created." : "Work item updated.", workItem });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The change could not be saved.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
