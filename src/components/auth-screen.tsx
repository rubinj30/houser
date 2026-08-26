"use client";

import { CheckCircle2, Home, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { requestMagicLinkAction } from "@/app/actions";

export function AuthScreen({ authError = false, invitationError = false }: { authError?: boolean; invitationError?: boolean }) {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState(invitationError ? "You signed in, but the household invitation could not be accepted. Ask the household owner to resend it." : authError ? "That sign-in link could not be verified. Request a fresh one below." : "");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setIsSending(true);
    setError("");
    try {
      await requestMagicLinkAction({ email: normalizedEmail });
      setSentTo(normalizedEmail);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "The sign-in link could not be sent.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      <section className="grain hidden bg-[var(--forest-dark)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-[15px] bg-[var(--lime)] text-[var(--forest-dark)]"><Home className="size-5" /></div>
          <div><p className="font-display text-xl font-extrabold tracking-tight">Houser</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Care for every corner</p></div>
        </div>
        <div className="max-w-xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--lime)]">A calm record of your homes</p>
          <h1 className="font-display mt-5 text-5xl font-extrabold leading-[1.02] tracking-[-0.055em]">Know what needs attention—and what has already been handled.</h1>
          <div className="mt-8 grid gap-4 text-sm text-white/65 sm:grid-cols-2">
            <p className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--lime)]" /> Private, account-scoped property records.</p>
            <p className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--lime)]" /> Durable status notes and work history.</p>
          </div>
        </div>
        <p className="text-xs text-white/35">Built for the two people who care for these homes.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-[15px] bg-[var(--forest-dark)] text-[var(--lime)]"><Home className="size-5" /></div>
            <p className="font-display text-xl font-extrabold tracking-tight">Houser</p>
          </div>
          {sentTo ? (
            <div className="rounded-[28px] border border-black/7 bg-[var(--paper)] p-6 surface-shadow sm:p-8">
              <div className="grid size-12 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><Mail className="size-5" /></div>
              <h1 className="font-display mt-6 text-3xl font-extrabold tracking-[-0.045em]">Check your email</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">We sent a secure sign-in link to <strong className="text-[var(--ink)]">{sentTo}</strong>. Open it on this device to continue.</p>
              <button type="button" onClick={() => setSentTo(null)} className="mt-6 min-h-11 text-sm font-extrabold text-[var(--forest)]">Use another email</button>
            </div>
          ) : (
            <form onSubmit={submit} autoComplete="on" className="rounded-[28px] border border-black/7 bg-[var(--paper)] p-6 surface-shadow sm:p-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Private workspace</p>
              <h1 className="font-display mt-3 text-3xl font-extrabold tracking-[-0.045em]">Sign in to Houser</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Enter your email and we’ll send a password-free sign-in link.</p>
              <label htmlFor="sign-in-email" className="mt-7 block"><span className="text-xs font-extrabold">Email address</span><input id="sign-in-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[var(--forest)]/40" /></label>
              {error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}
              <button type="submit" disabled={isSending || !email.trim()} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSending ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}{isSending ? "Sending link…" : "Email me a sign-in link"}</button>
              <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]">No password required. Sign-in links are sent to active household members and invited emails.</p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
