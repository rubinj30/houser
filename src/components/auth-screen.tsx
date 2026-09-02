"use client";

import { CheckCircle2, Fingerprint, Home, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { requestAccountCreationAction, requestMagicLinkAction } from "@/app/actions";
import { browserSupportsPasskeys, passkeyErrorMessage, subscribeToPasskeySupport } from "@/lib/passkeys";
import { createClient } from "@/lib/supabase/client";

export function AuthScreen({ authError = false, invitationError = false }: { authError?: boolean; invitationError?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSigningWithPasskey, setIsSigningWithPasskey] = useState(false);
  const supportsPasskeys = useSyncExternalStore(subscribeToPasskeySupport, browserSupportsPasskeys, () => false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState(invitationError ? "You signed in, but the household invitation could not be accepted. Ask the household owner to resend it." : authError ? "That sign-in link could not be verified. Request a fresh one below." : "");

  const signInWithPasskey = async () => {
    setIsSigningWithPasskey(true);
    setError("");
    try {
      const { data, error: passkeyError } = await createClient().auth.signInWithPasskey();
      if (passkeyError || !data?.session) {
        setError(passkeyErrorMessage(passkeyError, "sign-in"));
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (passkeyError) {
      setError(passkeyErrorMessage(passkeyError, "sign-in"));
    } finally {
      setIsSigningWithPasskey(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    setIsSending(true);
    setError("");
    try {
      await (mode === "signup" ? requestAccountCreationAction({ email: normalizedEmail }) : requestMagicLinkAction({ email: normalizedEmail }));
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
        <p className="text-xs text-white/35">Built for homeowners who want a trustworthy history of every property.</p>
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
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">We sent a secure {mode === "signup" ? "account creation" : "sign-in"} link to <strong className="text-[var(--ink)]">{sentTo}</strong>. Open it on this device to continue.</p>
              <button type="button" onClick={() => setSentTo(null)} className="mt-6 min-h-11 text-sm font-extrabold text-[var(--forest)]">Use another email</button>
            </div>
          ) : (
            <form onSubmit={submit} autoComplete="on" className="rounded-[28px] border border-black/7 bg-[var(--paper)] p-6 surface-shadow sm:p-8">
              <div className="grid grid-cols-2 rounded-xl bg-black/[0.045] p-1" aria-label="Account access"><button type="button" aria-pressed={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }} className={`min-h-10 rounded-lg text-xs font-extrabold ${mode === "signin" ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>Sign in</button><button type="button" aria-pressed={mode === "signup"} onClick={() => { setMode("signup"); setError(""); }} className={`min-h-10 rounded-lg text-xs font-extrabold ${mode === "signup" ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"}`}>Create account</button></div>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">{mode === "signup" ? "Start your private home record" : "Private workspace"}</p>
              <h1 className="font-display mt-3 text-3xl font-extrabold tracking-[-0.045em]">{mode === "signup" ? "Create your Houser account" : "Sign in to Houser"}</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{mode === "signup" ? "Enter your email. We’ll send one secure link to verify it and begin setup—no password required." : "Use Face ID or a passkey after setting it up, or request a password-free email link."}</p>
              {mode === "signin" && supportsPasskeys ? <><button type="button" disabled={isSigningWithPasskey || isSending} onClick={() => void signInWithPasskey()} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSigningWithPasskey ? <LoaderCircle className="size-4 animate-spin"/> : <Fingerprint className="size-[18px]"/>}{isSigningWithPasskey ? "Waiting for your device…" : "Sign in with Face ID or passkey"}</button><div className="my-5 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]"><span className="h-px flex-1 bg-black/8"/>or use email<span className="h-px flex-1 bg-black/8"/></div></> : null}
              <label htmlFor="sign-in-email" className="mt-7 block"><span className="text-xs font-extrabold">Email address</span><input id="sign-in-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[var(--forest)]/40" /></label>
              {error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}
              <button type="submit" disabled={isSending || isSigningWithPasskey || !email.trim()} className={`mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50 ${mode === "signin" && supportsPasskeys ? "border border-[var(--forest)]/18 bg-white text-[var(--forest)]" : "bg-[var(--forest)] text-white"}`}>{isSending ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}{isSending ? "Sending link…" : mode === "signup" ? "Create account with email" : "Email me a sign-in link"}</button>
              <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]">{mode === "signup" ? "By continuing, you’ll create a private household workspace after verifying your email." : "No password required. Sign-in links are sent to active household members and invited emails."}</p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
