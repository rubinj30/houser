import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ workItemId: string }> };

const workItemIdSchema = z.string().uuid();
const saveGroupSchema = z.object({
  label: z.string().trim().min(1).max(120),
  workItemIds: z.array(z.string().uuid()).min(1).max(24),
});

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  return { supabase, userId: auth?.claims?.sub };
}

export async function GET(_request: Request, { params }: Context) {
  const parsedWorkItemId = workItemIdSchema.safeParse((await params).workItemId);
  if (!parsedWorkItemId.success) return NextResponse.json({ error: "Invalid work item." }, { status: 400 });

  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "Sign in to view related work." }, { status: 401 });

  const { data, error } = await supabase.rpc("get_related_work_group", {
    target_work_item_id: parsedWorkItemId.data,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json(data, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const parsedWorkItemId = workItemIdSchema.safeParse((await params).workItemId);
  if (!parsedWorkItemId.success) return NextResponse.json({ error: "Invalid work item." }, { status: 400 });

  const parsedBody = saveGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Choose at least one related work item and name the group." }, { status: 400 });

  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "Sign in to link related work." }, { status: 401 });

  const { data, error } = await supabase.rpc("set_related_work_group", {
    target_work_item_id: parsedWorkItemId.data,
    linked_work_item_ids: [...new Set(parsedBody.data.workItemIds)],
    group_label: parsedBody.data.label,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data, { headers: { "cache-control": "private, no-store" } });
}
