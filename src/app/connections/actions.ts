"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const revokeSchema = z.object({ clientId: z.string().uuid() });

export async function revokeAgentConnectionAction(formData: FormData) {
  const { clientId } = revokeSchema.parse({ clientId: formData.get("clientId") });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) throw new Error("Sign in to manage agent connections.");
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) throw new Error(error.message);
  revalidatePath("/connections");
}
