import { Bot, Check, Home, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { createClient } from "@/lib/supabase/server";
import { decideOAuthAuthorization } from "./actions";

export default async function OAuthConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const authorizationId = (await searchParams).authorization_id;
  if (!authorizationId) return <ConsentError message="This authorization request is missing its identifier." />;

  const returnTo = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return <AuthScreen returnTo={returnTo} />;

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <ConsentError message={error?.message ?? "This authorization request is no longer available."} />;
  if ("redirect_url" in data) redirect(data.redirect_url);

  const scopes = data.scope.split(" ").filter(Boolean);
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <section className="w-full max-w-lg rounded-[30px] border border-black/7 bg-[var(--paper)] p-6 surface-shadow sm:p-9">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[var(--forest)] text-[var(--lime)]"><Home className="size-5" /></span><span className="font-display text-xl font-extrabold">Houser</span></div>
          <span className="grid size-11 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><Bot className="size-5" /></span>
        </div>
        <p className="mt-8 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Agent access</p>
        <h1 className="font-display mt-3 text-3xl font-extrabold tracking-[-0.045em]">Connect {data.client.name} to Houser?</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">This lets the agent use your Houser account to find properties and Work items and, only after you confirm, create or update work.</p>
        <div className="mt-6 rounded-2xl bg-black/[0.035] p-4">
          <p className="flex gap-3 text-sm font-bold"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--forest)]" /> Houser’s existing household permissions continue to control every record.</p>
          {scopes.length ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Requested identity access: {scopes.join(", ")}</p> : null}
        </div>
        <form action={decideOAuthAuthorization} className="mt-7 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="authorizationId" value={authorizationId} />
          <button name="decision" value="approve" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white"><Check className="size-4" />Allow access</button>
          <button name="decision" value="deny" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-5 text-sm font-extrabold"><X className="size-4" />Deny</button>
        </form>
        <p className="mt-5 text-center text-[11px] leading-5 text-[var(--muted)]">Signed in as {data.user.email}. You can revoke this connection later in Houser settings.</p>
      </section>
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return <main className="flex min-h-dvh items-center justify-center p-6"><section className="max-w-md rounded-[28px] border border-black/7 bg-[var(--paper)] p-7 surface-shadow"><h1 className="font-display text-2xl font-extrabold">Agent connection unavailable</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white">Return to Houser</Link></section></main>;
}
