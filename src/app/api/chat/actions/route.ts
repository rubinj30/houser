import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { houserChatActionSchema } from "@/lib/houser-chat";
import { createHouseholdProperty } from "@/lib/property-mutations";
import { createClient } from "@/lib/supabase/server";
import { createChatWorkItem, updateChatWorkItem } from "@/lib/work-planning";

export async function POST(request: Request) {
  const parsed = houserChatActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "This proposed change is no longer valid. Ask Houser to prepare it again." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (authError || !userId) return NextResponse.json({ error: "Sign in to update Houser." }, { status: 401 });

  try {
    if (parsed.data.type === "create_property") {
      const property = await createHouseholdProperty(supabase, userId, parsed.data);
      revalidatePath("/");
      revalidatePath("/household");
      revalidatePath("/chat");
      return NextResponse.json({ message: "Property created.", property });
    }

    const workItem = parsed.data.type === "create_work_item"
      ? await createChatWorkItem(supabase, parsed.data)
      : await updateChatWorkItem(supabase, parsed.data);
    revalidatePath("/");
    revalidatePath("/chat");
    return NextResponse.json({
      message: parsed.data.type === "create_work_item" ? "Work item created." : "Work item updated.",
      workItem,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The change could not be saved.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
