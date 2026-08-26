"use client";

import { Fingerprint, KeyRound, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { browserSupportsPasskeys, passkeyErrorMessage, passkeyName, subscribeToPasskeySupport, type HouserPasskey } from "@/lib/passkeys";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

function formatPasskeyDate(value: string | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function PasskeySettings() {
  const clientRef = useRef<SupabaseBrowserClient | null>(null);
  const isSupported = useSyncExternalStore(subscribeToPasskeySupport, browserSupportsPasskeys, () => false);
  const [passkeys, setPasskeys] = useState<HouserPasskey[]>([]);
  const [busyKey, setBusyKey] = useState<"load" | "register" | string | null>("load");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const client = useCallback(() => {
    clientRef.current ??= createClient();
    return clientRef.current;
  }, []);

  const loadPasskeys = useCallback(async () => {
    setBusyKey("load");
    setError("");
    const { data, error: listError } = await client().auth.passkey.list();
    if (listError) {
      setError(passkeyErrorMessage(listError, "list"));
    } else {
      setPasskeys(data ?? []);
    }
    setBusyKey(null);
  }, [client]);

  useEffect(() => {
    if (!isSupported) return;
    let active = true;
    void client().auth.passkey.list().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) setError(passkeyErrorMessage(listError, "list"));
      else setPasskeys(data ?? []);
      setBusyKey(null);
    });
    return () => {
      active = false;
    };
  }, [client, isSupported]);

  const register = async () => {
    setBusyKey("register");
    setError("");
    setSuccess("");
    const { data, error: registerError } = await client().auth.registerPasskey();
    if (registerError || !data) {
      setError(passkeyErrorMessage(registerError, "register"));
      setBusyKey(null);
      return;
    }
    setSuccess("Face ID or passkey sign-in is ready on this account.");
    await loadPasskeys();
  };

  const remove = async (passkey: HouserPasskey) => {
    if (!window.confirm(`Remove ${passkeyName(passkey)} from your Houser account?`)) return;
    setBusyKey(passkey.id);
    setError("");
    setSuccess("");
    const { error: deleteError } = await client().auth.passkey.delete({ passkeyId: passkey.id });
    if (deleteError) {
      setError(passkeyErrorMessage(deleteError, "delete"));
    } else {
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
      setSuccess("Passkey removed. You can still sign in with your email link.");
    }
    setBusyKey(null);
  };

  return <section className="rounded-[26px] border border-black/7 bg-[var(--paper)] p-5 surface-shadow sm:p-6">
    <div className="flex items-start gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><Fingerprint className="size-5"/></div>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Sign-in security</p>
        <h2 className="font-display mt-1 text-xl font-extrabold tracking-[-0.035em]">Face ID &amp; passkeys</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">On supported Apple devices, your passkey can use Face ID or Touch ID. Your biometric data stays on your device.</p>
      </div>
    </div>

    {isSupported === false ? <p className="mt-5 rounded-2xl bg-black/4 px-4 py-3 text-xs leading-5 text-[var(--muted)]">This browser does not support passkeys. You can continue using Houser’s email sign-in links.</p> : null}

    {isSupported ? <>
      <div className="mt-5 space-y-2">
        {busyKey === "load" ? <div className="flex min-h-16 items-center justify-center rounded-2xl border border-black/7"><LoaderCircle className="size-4 animate-spin text-[var(--forest)]"/><span className="sr-only">Loading passkeys</span></div> : null}
        {busyKey !== "load" && passkeys.length === 0 ? <div className="rounded-2xl border border-dashed border-black/12 px-4 py-4"><p className="text-xs font-extrabold">No passkeys yet</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Add one while signed in. Afterward, Face ID or your device passkey can open Houser without waiting for email.</p></div> : null}
        {passkeys.map((passkey) => <div key={passkey.id} className="flex items-center gap-3 rounded-2xl border border-black/7 bg-white/55 p-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)]/70 text-[var(--forest)]"><KeyRound className="size-[18px]"/></div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{passkeyName(passkey)}</p><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Added {formatPasskeyDate(passkey.created_at)}{passkey.last_used_at ? ` · Used ${formatPasskeyDate(passkey.last_used_at)}` : ""}</p></div>
          <button type="button" disabled={Boolean(busyKey)} onClick={() => void remove(passkey)} className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[#f8ddd7] hover:text-[#8c3328] disabled:opacity-45" aria-label={`Remove ${passkeyName(passkey)}`}>{busyKey === passkey.id ? <LoaderCircle className="size-4 animate-spin"/> : <Trash2 className="size-4"/>}</button>
        </div>)}
      </div>
      <button type="button" disabled={Boolean(busyKey)} onClick={() => void register()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-extrabold text-white disabled:opacity-45">{busyKey === "register" ? <LoaderCircle className="size-4 animate-spin"/> : <Fingerprint className="size-[18px]"/>}{busyKey === "register" ? "Waiting for your device…" : passkeys.length ? "Add another passkey" : "Set up Face ID or a passkey"}</button>
    </> : null}

    {error ? <p role="alert" className="mt-4 rounded-2xl bg-[#f8ddd7] px-4 py-3 text-xs font-bold leading-5 text-[#8c3328]">{error}</p> : null}
    {success ? <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-[#dcefdc] px-4 py-3 text-xs font-bold leading-5 text-[#246235]"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{success}</p> : null}
    <p className="mt-4 text-[10px] leading-4 text-[var(--muted)]">Keep access to your email as a recovery option. Passkeys are tied to Houser’s production web address.</p>
  </section>;
}
