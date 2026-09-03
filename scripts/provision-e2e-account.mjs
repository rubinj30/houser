import { createClient } from "@supabase/supabase-js";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "E2E_USER_EMAIL", "E2E_USER_PASSWORD"];
const missing = required.filter((name) => !process.env[name] || process.env[name] === "[SENSITIVE]");
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let userId = null;
for (let page = 1; page <= 10 && !userId; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  userId = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
  if (data.users.length < 100) break;
}

if (userId) {
  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) throw error;
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Houser E2E" } });
  if (error || !data.user) throw error ?? new Error("Supabase did not return the E2E user.");
  userId = data.user.id;
}

const browserClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { error: signInError } = await browserClient.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
const { error: bootstrapError } = await browserClient.rpc("bootstrap_account", { account_name: "Houser E2E" });
if (bootstrapError) throw bootstrapError;
const { data: membership, error: membershipError } = await browserClient.from("account_memberships").select("account_id").eq("user_id", userId).eq("status", "active").single();
if (membershipError) throw membershipError;
const { data: existing, error: propertyError } = await browserClient.from("properties").select("id").eq("account_id", membership.account_id).eq("display_name", "Playwright Test Home").maybeSingle();
if (propertyError) throw propertyError;
if (!existing) {
  const { error } = await browserClient.from("properties").insert({ account_id: membership.account_id, display_name: "Playwright Test Home", property_type: "primary_residence", timezone: "America/New_York" });
  if (error) throw error;
}
await browserClient.auth.signOut();
console.log("Dedicated Houser E2E account is ready.");
