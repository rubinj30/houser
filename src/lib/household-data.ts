import "server-only";

import { createClient } from "@/lib/supabase/server";

export type HouseholdRole = "owner" | "contributor" | "viewer";

export type HouseholdSettings = {
  account: { id: string; name: string };
  currentUserId: string;
  currentRole: HouseholdRole | "manager";
  members: Array<{
    userId: string;
    email: string;
    displayName: string | null;
    role: HouseholdRole | "manager";
    joinedAt: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: HouseholdRole;
    expiresAt: string;
    createdAt: string;
  }>;
  properties: Array<{
    id: string;
    displayName: string;
    propertyType: string;
  }>;
};

export async function getHouseholdSettings(): Promise<HouseholdSettings | null> {
  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("account_memberships")
    .select("account_id,role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(`Could not load household membership: ${membershipError.message}`);
  if (!membership) return null;

  const [accountResult, membershipResult, propertyResult, invitationResult] = await Promise.all([
    supabase.from("accounts").select("id,name").eq("id", membership.account_id).single(),
    supabase
      .from("account_memberships")
      .select("user_id,role,created_at")
      .eq("account_id", membership.account_id)
      .eq("status", "active")
      .order("created_at"),
    supabase
      .from("properties")
      .select("id,display_name,property_type")
      .eq("account_id", membership.account_id)
      .eq("is_archived", false)
      .order("created_at"),
    membership.role === "owner"
      ? supabase
          .from("account_invitations")
          .select("id,email,role,expires_at,created_at")
          .eq("account_id", membership.account_id)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (accountResult.error) throw new Error(`Could not load household: ${accountResult.error.message}`);
  if (membershipResult.error) throw new Error(`Could not load household members: ${membershipResult.error.message}`);
  if (propertyResult.error) throw new Error(`Could not load household properties: ${propertyResult.error.message}`);
  if (invitationResult.error) throw new Error(`Could not load household invitations: ${invitationResult.error.message}`);

  const memberRows = membershipResult.data ?? [];
  const memberIds = memberRows.map((member) => member.user_id);
  const { data: profiles, error: profileError } = memberIds.length
    ? await supabase.from("profiles").select("id,email,display_name").in("id", memberIds)
    : { data: [], error: null };
  if (profileError) throw new Error(`Could not load household profiles: ${profileError.message}`);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return {
    account: accountResult.data,
    currentUserId: userId,
    currentRole: membership.role,
    members: memberRows.map((member) => {
      const profile = profileById.get(member.user_id);
      return {
        userId: member.user_id,
        email: profile?.email ?? "Email unavailable",
        displayName: profile?.display_name ?? null,
        role: member.role,
        joinedAt: member.created_at,
      };
    }),
    invitations: (invitationResult.data ?? []).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as HouseholdRole,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
    })),
    properties: (propertyResult.data ?? []).map((property) => ({
      id: property.id,
      displayName: property.display_name,
      propertyType: property.property_type,
    })),
  };
}
