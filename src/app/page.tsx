import { AuthScreen } from "@/components/auth-screen";
import { HouserApp } from "@/components/houser-app";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { getAuthenticatedEmail, getHouserWorkspace } from "@/lib/houser-data";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth_error?: string; work?: string; property?: string; welcome?: string }> }) {
  const params = await searchParams;
  const email = await getAuthenticatedEmail();
  if (!email) return <AuthScreen authError={params.auth_error === "1"} invitationError={params.auth_error === "invite"} />;

  const workspace = await getHouserWorkspace(params.property);
  if (!workspace) return <OnboardingScreen email={email} isNewAccount={params.welcome === "1"} />;

  return (
    <HouserApp
      seed={workspace.seed}
      propertyId={workspace.propertyId}
      selectedPropertyId={workspace.selectedPropertyId}
      properties={workspace.properties}
      userEmail={workspace.userEmail}
      hasInspectionDocument={workspace.hasInspectionDocument}
      initialWorkReportId={params.work ?? null}
      initialReviewStatuses={workspace.reviewStatuses}
      initialReviewActivities={workspace.reviewActivities}
      initialServiceRecords={workspace.serviceRecords}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
