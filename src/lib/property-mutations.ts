import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const propertyInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  propertyType: z.enum(["primary_residence", "rental", "vacation_home", "other"]),
  addressLine1: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(120).nullable(),
  region: z.string().trim().max(120).nullable(),
  postalCode: z.string().trim().max(24).nullable(),
  timezone: z.string().trim().min(1).max(80).nullable(),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export async function createHouseholdProperty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: PropertyInput,
) {
  const values = propertyInputSchema.parse(input);
  const { data: membership, error: membershipError } = await supabase
    .from("account_memberships")
    .select("account_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new Error("Only a household owner can add a property.");

  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      account_id: membership.account_id,
      display_name: values.displayName,
      property_type: values.propertyType,
      address_line1: values.addressLine1 || null,
      city: values.city || null,
      region: values.region || null,
      postal_code: values.postalCode || null,
      timezone: values.timezone || "America/New_York",
    })
    .select("id,display_name,property_type,address_line1,city,region,postal_code,timezone")
    .single();
  if (error) throw error;

  return {
    id: property.id,
    displayName: property.display_name,
    propertyType: property.property_type,
    addressLine1: property.address_line1,
    city: property.city,
    region: property.region,
    postalCode: property.postal_code,
    timezone: property.timezone,
  };
}
