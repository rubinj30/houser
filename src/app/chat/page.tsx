import { redirect } from "next/navigation";
import { HouserChat } from "@/components/houser-chat";
import { getAuthenticatedEmail, getHouserWorkspace } from "@/lib/houser-data";

export const metadata = {
  title: "Ask Houser — Home answers from your records",
  description: "Ask questions about your home maintenance, work, assets, and service history.",
};

export default async function ChatPage() {
  const email = await getAuthenticatedEmail();
  if (!email) redirect("/");
  const workspace = await getHouserWorkspace();
  if (!workspace) redirect("/");

  return <HouserChat userEmail={email} propertyName={workspace.seed.property.displayName} />;
}
