import { redirect } from "next/navigation";
import { HouseholdSettingsView } from "@/components/household-settings";
import { getAuthenticatedEmail } from "@/lib/houser-data";
import { getHouseholdSettings } from "@/lib/household-data";

export const metadata = {
  title: "Household — Houser",
  description: "Manage the people and properties in your Houser household.",
};

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ addProperty?: string }> }) {
  const email = await getAuthenticatedEmail();
  if (!email) redirect("/");
  const query = await searchParams;
  const household = await getHouseholdSettings();
  if (!household) redirect("/");
  return <HouseholdSettingsView household={household} initiallyAddingProperty={query.addProperty === "1"} />;
}
