"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const consentSchema = z.object({
  authorizationId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
});

export async function decideOAuthAuthorization(formData: FormData) {
  const input = consentSchema.parse({
    authorizationId: formData.get("authorizationId"),
    decision: formData.get("decision"),
  });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(input.authorizationId)}`);
  }

  const result = input.decision === "approve"
    ? await supabase.auth.oauth.approveAuthorization(input.authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(input.authorizationId, { skipBrowserRedirect: true });
  if (result.error || !result.data?.redirect_url) {
    throw new Error(result.error?.message ?? "Houser could not complete the authorization request.");
  }
  redirect(result.data.redirect_url);
}
