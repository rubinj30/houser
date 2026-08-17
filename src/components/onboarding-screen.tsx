import { ArrowRight, ClipboardCheck, Home, LoaderCircle, ShieldCheck } from "lucide-react";
import { bootstrapHouserAction, signOutAction } from "@/app/actions";

export function OnboardingScreen({ email }: { email: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-black/7 bg-[var(--paper)] surface-shadow">
        <div className="bg-[var(--forest-dark)] p-6 text-white sm:p-9">
          <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-[15px] bg-[var(--lime)] text-[var(--forest-dark)]"><Home className="size-5" /></div><div><p className="font-display text-xl font-extrabold">Welcome to Houser</p><p className="text-xs text-white/50">Signed in as {email}</p></div></div>
          <h1 className="font-display mt-10 max-w-xl text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">Turn the Sample Home inspection into a private, durable workspace.</h1>
        </div>
        <div className="p-6 sm:p-9">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><ClipboardCheck className="size-5 text-[var(--forest)]" /><p className="mt-3 text-sm font-extrabold">51 inspection findings</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Imported as items that still require owner verification.</p></div>
            <div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><ShieldCheck className="size-5 text-[var(--forest)]" /><p className="mt-3 text-sm font-extrabold">Private by default</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Property records are protected by account-level access policies.</p></div>
          </div>
          <form action={bootstrapHouserAction} className="mt-7">
            <button type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white">Create my Houser workspace <ArrowRight className="size-4" /></button>
          </form>
          <form action={signOutAction} className="mt-3 text-center"><button type="submit" className="min-h-10 px-4 text-xs font-extrabold text-[var(--muted)]">Sign out and use another email</button></form>
          <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]"><LoaderCircle className="mr-1 inline size-3" /> Initial setup normally takes only a few seconds.</p>
        </div>
      </section>
    </main>
  );
}
