import { redirect } from "next/navigation";
import { HouseholdSettingsView } from "@/components/household-settings";
import { getAuthenticatedEmail } from "@/lib/houser-data";
import { getHouseholdSettings } from "@/lib/household-data";

export const metadata = {
  title: "Household — Houser",
  description: "Manage the people and properties in your Houser household.",
};

export default async function HouseholdPage() {
  const email = await getAuthenticatedEmail();
  if (!email) redirect("/");
  const household = await getHouseholdSettings();
  if (!household) redirect("/");
  return <HouseholdSettingsView household={household} />;
}
