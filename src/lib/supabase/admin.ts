import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createEmailAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Houser email authentication is not configured.");

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function isHouserEmailAllowed(email: string) {
  const admin = createAdminClient();
  if (!admin) return false;

  const normalizedEmail = email.trim().toLowerCase();
  const [{ data: invitation }, { data: profile }] = await Promise.all([
    admin
      .from("account_invitations")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle(),
    admin.from("profiles").select("id").eq("email", normalizedEmail).limit(1).maybeSingle(),
  ]);

  if (invitation) return true;
  if (!profile) return false;
  const { data: membership } = await admin
    .from("account_memberships")
    .select("account_id")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return Boolean(membership);
}
