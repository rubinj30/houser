"use client";

import { ArrowLeft, Check, ChevronDown, Home, LoaderCircle, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  inviteHouseholdMemberAction,
  removeHouseholdMemberAction,
  revokeHouseholdInvitationAction,
  updateHouseholdMemberRoleAction,
} from "@/app/household/actions";
import type { HouseholdRole, HouseholdSettings } from "@/lib/household-data";

const roleLabels: Record<HouseholdRole | "manager", string> = {
  owner: "Owner",
  manager: "Member",
  contributor: "Member",
  viewer: "Viewer",
};

const roleDescriptions: Record<HouseholdRole, string> = {
  owner: "Can manage people, properties, and all household records.",
  contributor: "Can create and update work, documents, assets, and history.",
  viewer: "Can see household records but cannot change them.",
};

function initials(name: string) {
  return name.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function HouseholdSettingsView({ household }: { household: HouseholdSettings }) {
  const isOwner = household.currentRole === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HouseholdRole>("contributor");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const run = async (key: string, action: () => Promise<unknown>, message?: string) => {
    setBusyKey(key);
    setError("");
    setSuccess("");
    try {
      await action();
      if (message) setSuccess(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The household could not be updated.");
    } finally {
      setBusyKey(null);
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return;
    await run("invite", async () => {
      await inviteHouseholdMemberAction({ accountId: household.account.id, email: targetEmail, role });
      setEmail("");
    }, `Invitation sent to ${targetEmail}.`);
  };

  return <main className="min-h-dvh bg-[var(--canvas)]">
    <header className="sticky top-0 z-20 border-b border-black/6 bg-[rgba(243,241,235,0.92)] px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <Link href="/" className="grid size-11 shrink-0 place-items-center rounded-xl border border-black/8 bg-white/70 text-[var(--forest)]" aria-label="Back to Houser"><ArrowLeft className="size-5"/></Link>
        <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Household settings</p><h1 className="font-display text-xl font-extrabold tracking-[-0.035em]">{household.account.name}</h1></div>
      </div>
    </header>

    <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 sm:py-9 lg:grid-cols-[1fr_0.7fr]">
      <div className="space-y-5">
        <section className="rounded-[26px] border border-black/7 bg-[var(--paper)] p-5 surface-shadow sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">People</p><h2 className="font-display mt-1 text-2xl font-extrabold tracking-[-0.04em]">Household members</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">Members use their own sign-in and share access to every property in this household.</p></div><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><Users className="size-5"/></div></div>
          <div className="mt-6 divide-y divide-black/6">
            {household.members.map((member) => <div key={member.userId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--forest)] text-xs font-extrabold text-white">{initials(member.displayName ?? member.email)}</div><div className="min-w-0"><p className="truncate text-sm font-extrabold">{member.displayName ?? member.email.split("@")[0]}</p><p className="truncate text-xs text-[var(--muted)]">{member.email}{member.userId === household.currentUserId ? " · You" : ""}</p></div></div>
              {isOwner ? <div className="flex items-center gap-2 pl-14 sm:pl-0"><label className="relative"><span className="sr-only">Role for {member.email}</span><select value={member.role === "manager" ? "contributor" : member.role} disabled={busyKey === member.userId} onChange={(event) => void run(member.userId, () => updateHouseholdMemberRoleAction({ accountId: household.account.id, userId: member.userId, role: event.target.value as HouseholdRole }), "Member role updated.")} className="h-11 appearance-none rounded-xl border border-black/8 bg-white pl-3 pr-9 text-xs font-extrabold disabled:opacity-50"><option value="owner">Owner</option><option value="contributor">Member</option><option value="viewer">Viewer</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted)]"/></label><button type="button" disabled={busyKey === member.userId} onClick={() => { if (window.confirm(`Remove ${member.email} from this household? Their historical activity will remain.`)) void run(member.userId, () => removeHouseholdMemberAction({ accountId: household.account.id, userId: member.userId }), "Member access removed."); }} className="grid size-11 place-items-center rounded-xl border border-black/8 text-[var(--muted)] hover:bg-[#f8ddd7] hover:text-[#8c3328] disabled:opacity-50" aria-label={`Remove ${member.email}`}>{busyKey === member.userId ? <LoaderCircle className="size-4 animate-spin"/> : <Trash2 className="size-4"/>}</button></div> : <span className="pl-14 text-xs font-extrabold text-[var(--muted)] sm:pl-0">{roleLabels[member.role]}</span>}
            </div>)}
          </div>
        </section>

        {isOwner ? <section className="rounded-[26px] border border-black/7 bg-[var(--paper)] p-5 surface-shadow sm:p-7">
          <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><UserPlus className="size-5"/></div><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Invite</p><h2 className="font-display text-xl font-extrabold tracking-[-0.035em]">Add someone you trust</h2></div></div>
          <form onSubmit={invite} className="mt-5 space-y-4"><label className="block"><span className="text-xs font-extrabold">Email address</span><input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="family@example.com" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[var(--forest)]/40"/></label><label className="block"><span className="text-xs font-extrabold">Access</span><select value={role} onChange={(event) => setRole(event.target.value as HouseholdRole)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-bold"><option value="contributor">Member</option><option value="owner">Owner</option><option value="viewer">Viewer</option></select><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{roleDescriptions[role]}</p></label><button type="submit" disabled={!email.trim() || busyKey === "invite"} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white disabled:opacity-45">{busyKey === "invite" ? <LoaderCircle className="size-4 animate-spin"/> : <Mail className="size-4"/>}{busyKey === "invite" ? "Sending invitation…" : "Send invitation"}</button></form>
        </section> : null}

        {error ? <p role="alert" className="rounded-2xl bg-[#f8ddd7] px-4 py-3 text-xs font-bold text-[#8c3328]">{error}</p> : null}
        {success ? <p role="status" className="flex items-center gap-2 rounded-2xl bg-[#dcefdc] px-4 py-3 text-xs font-bold text-[#246235]"><Check className="size-4"/>{success}</p> : null}
      </div>

      <aside className="space-y-5">
        <section className="rounded-[26px] border border-black/7 bg-[var(--paper)] p-5 surface-shadow sm:p-6"><div className="flex items-center gap-3"><Home className="size-5 text-[var(--forest)]"/><h2 className="font-display text-lg font-extrabold">Shared properties</h2></div><div className="mt-4 space-y-2">{household.properties.map((property) => <div key={property.id} className="rounded-2xl bg-[var(--mint)]/45 p-4"><p className="text-sm font-extrabold">{property.displayName}</p><p className="mt-1 text-[10px] font-bold capitalize text-[var(--muted)]">{property.propertyType.replaceAll("_", " ")}</p></div>)}</div><p className="mt-4 text-xs leading-5 text-[var(--muted)]">Every active household member can access these properties. Property-specific access can be added later for managers or vendors.</p></section>
        {isOwner && household.invitations.length ? <section className="rounded-[26px] border border-black/7 bg-[var(--paper)] p-5 surface-shadow sm:p-6"><h2 className="font-display text-lg font-extrabold">Pending invitations</h2><div className="mt-4 divide-y divide-black/6">{household.invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{invitation.email}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{roleLabels[invitation.role]} · expires {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(invitation.expiresAt))}</p></div><button type="button" disabled={busyKey === invitation.id} onClick={() => void run(invitation.id, () => revokeHouseholdInvitationAction({ invitationId: invitation.id }), "Invitation revoked.")} className="min-h-10 rounded-xl px-3 text-xs font-extrabold text-[var(--muted)] hover:bg-black/5 disabled:opacity-50">Revoke</button></div>)}</div></section> : null}
        <section className="rounded-[26px] bg-[var(--forest-dark)] p-5 text-white sm:p-6"><ShieldCheck className="size-5 text-[var(--lime)]"/><h2 className="font-display mt-4 text-lg font-extrabold">Private by household</h2><p className="mt-2 text-xs leading-5 text-white/55">Each person signs in separately. Access changes take effect immediately, while their prior notes and work history remain attributed to them.</p></section>
      </aside>
    </div>
  </main>;
}
