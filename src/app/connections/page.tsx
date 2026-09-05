import { ArrowLeft, Bot, ShieldCheck, Unplug } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revokeAgentConnectionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/");
  const { data: grants, error } = await supabase.auth.oauth.listGrants();

  return (
    <main className="min-h-dvh px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/household" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--forest)]"><ArrowLeft className="size-4" />Household settings</Link>
        <section className="mt-6 rounded-[30px] border border-black/7 bg-[var(--paper)] p-6 surface-shadow sm:p-9">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Security</p><h1 className="font-display mt-3 text-3xl font-extrabold tracking-[-0.045em]">Agent connections</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">Review ChatGPT, Codex, and other clients you allowed to use Houser. Revoking a connection invalidates its refresh tokens and removes ongoing access.</p></div><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><Bot className="size-5" /></span></div>
          {error ? <p role="alert" className="mt-6 rounded-2xl bg-[#f8ddd7] px-4 py-3 text-sm font-bold text-[#8c3328]">Agent connections are not available yet. Enable Houser’s OAuth Server in Supabase first.</p> : grants?.length ? <div className="mt-7 divide-y divide-black/7 rounded-2xl border border-black/7 px-4">{grants.map((grant) => <article key={grant.client.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-display text-base font-extrabold">{grant.client.name}</p><p className="mt-1 text-xs text-[var(--muted)]">Allowed {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(grant.granted_at))} · {grant.scopes.join(", ")}</p></div><form action={revokeAgentConnectionAction}><input type="hidden" name="clientId" value={grant.client.id} /><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-xs font-extrabold text-[#8c3328]"><Unplug className="size-4" />Revoke access</button></form></article>)}</div> : <div className="mt-7 rounded-2xl border border-dashed border-black/12 p-6 text-center"><ShieldCheck className="mx-auto size-6 text-[var(--forest)]" /><p className="mt-3 text-sm font-extrabold">No agents are connected</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Connections will appear here after you approve access from ChatGPT, Codex, or another MCP client.</p></div>}
          <Link href="/docs/agent-access" className="mt-6 inline-flex min-h-11 items-center text-sm font-extrabold text-[var(--forest)]">How to connect an agent</Link>
        </section>
      </div>
    </main>
  );
}
