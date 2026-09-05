import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client that acts as the user represented by an OAuth
 * bearer token. Database access must continue to flow through RLS; this client
 * must never be replaced with the service-role client in agent-facing code.
 */
export function createBearerClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Houser authentication is not configured.");

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function authenticateBearerToken(accessToken: string) {
  const supabase = createBearerClient(accessToken);
  const { data, error } = await supabase.auth.getClaims(accessToken);
  const claims = data?.claims;
  if (error || typeof claims?.sub !== "string" || claims.role !== "authenticated") return null;

  return {
    supabase,
    userId: claims.sub,
    clientId: typeof claims.client_id === "string" ? claims.client_id : "unknown-client",
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
  };
}
