"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createEmailAuthClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createHouseholdProperty, propertyInputSchema } from "@/lib/property-mutations";

const invitationSchema = z.object({
  accountId: z.uuid(),
  email: z.email(),
  role: z.enum(["owner", "contributor", "viewer"]),
});
const roleSchema = z.object({
  accountId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "contributor", "viewer"]),
});
const memberSchema = z.object({ accountId: z.uuid(), userId: z.uuid() });
const invitationIdSchema = z.object({ invitationId: z.uuid() });

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) throw new Error("You must be signed in to manage this household.");
  return { supabase, userId: data.claims.sub };
}

async function invitationRedirectUrl() {
  const requestHeaders = await headers();
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = configuredUrl ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/auth/confirm?next=/household`;
}

export async function inviteHouseholdMemberAction(input: z.input<typeof invitationSchema>) {
  const values = invitationSchema.parse(input);
  const { supabase } = await requireUser();
  const normalizedEmail = values.email.trim().toLowerCase();
  const { data: invitationId, error } = await supabase.rpc("create_account_invitation", {
    target_account_id: values.accountId,
    invite_email: normalizedEmail,
    invite_role: values.role,
  });
  if (error || !invitationId) throw new Error(error?.message ?? "The invitation could not be created.");

  const emailClient = createEmailAuthClient();
  const { error: emailError } = await emailClient.auth.signInWithOtp({
    email: normalizedEmail,
    options: { emailRedirectTo: await invitationRedirectUrl(), shouldCreateUser: true },
  });
  if (emailError) throw new Error(`The invitation was saved, but its email could not be sent: ${emailError.message}`);

  revalidatePath("/household");
  return { invitationId, email: normalizedEmail };
}

export async function updateHouseholdMemberRoleAction(input: z.input<typeof roleSchema>) {
  const values = roleSchema.parse(input);
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_account_member_role", {
    target_account_id: values.accountId,
    target_user_id: values.userId,
    next_role: values.role,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/household");
}

export async function removeHouseholdMemberAction(input: z.input<typeof memberSchema>) {
  const values = memberSchema.parse(input);
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_account_member", {
    target_account_id: values.accountId,
    target_user_id: values.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/household");
}

export async function revokeHouseholdInvitationAction(input: z.input<typeof invitationIdSchema>) {
  const values = invitationIdSchema.parse(input);
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("revoke_account_invitation", {
    target_invitation_id: values.invitationId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/household");
}

export async function createHouseholdPropertyAction(input: z.input<typeof propertyInputSchema>) {
  const values = propertyInputSchema.parse(input);
  const { supabase, userId } = await requireUser();
  const property = await createHouseholdProperty(supabase, userId, values);
  revalidatePath("/");
  revalidatePath("/household");
  revalidatePath("/chat");
  return property;
}
