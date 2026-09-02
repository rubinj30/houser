import { ArrowRight, ClipboardCheck, FileUp, Home, MessageCircle, ShieldCheck } from "lucide-react";
import { createInitialWorkspaceAction, signOutAction } from "@/app/actions";

export function OnboardingScreen({ email, isNewAccount = false }: { email: string; isNewAccount?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-4xl overflow-hidden rounded-[30px] border border-black/7 bg-[var(--paper)] surface-shadow">
        <div className="bg-[var(--forest-dark)] p-6 text-white sm:p-9">
          <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-[15px] bg-[var(--lime)] text-[var(--forest-dark)]"><Home className="size-5" /></div><div><p className="font-display text-xl font-extrabold">Welcome to Houser</p><p className="text-xs text-white/50">Signed in as {email}</p></div></div>
          <p className="mt-9 text-xs font-extrabold uppercase tracking-[0.15em] text-[var(--lime)]">{isNewAccount ? "Your account is ready" : "Finish setup"}</p>
          <h1 className="font-display mt-3 max-w-2xl text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">A clear record of what your home needs—and everything you’ve already handled.</h1>
        </div>
        <div className="p-6 sm:p-9">
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Houser features">
            <div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><FileUp className="size-5 text-[var(--forest)]" /><p className="mt-3 text-sm font-extrabold">Start with an inspection</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Upload a report and Houser turns its findings into reviewable Work items with page references.</p></div>
            <div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><ClipboardCheck className="size-5 text-[var(--forest)]" /><p className="mt-3 text-sm font-extrabold">Keep work history</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Track status, notes, invoices, photos, vendors, warranties, and future maintenance.</p></div>
            <div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><MessageCircle className="size-5 text-[var(--forest)]" /><p className="mt-3 text-sm font-extrabold">Ask your home</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use chat to find urgent work, understand assets, and prepare changes for your approval.</p></div>
          </div>
          <div className="mt-7 rounded-[22px] border border-[var(--forest)]/12 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--forest)]"/><div><h2 className="font-display text-xl font-extrabold">Name your first property</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">You can add its address and more properties later. Next, Houser will guide you to upload an inspection.</p></div></div>
            <form action={createInitialWorkspaceAction} className="mt-5 grid gap-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
              <label><span className="text-xs font-extrabold">Property name</span><input name="displayName" required maxLength={120} defaultValue="My Home" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[var(--forest)]/40"/></label>
              <label><span className="text-xs font-extrabold">Property type</span><select name="propertyType" defaultValue="primary_residence" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"><option value="primary_residence">Primary residence</option><option value="rental">Rental</option><option value="vacation_home">Vacation home</option><option value="other">Other</option></select></label>
              <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white">Continue <ArrowRight className="size-4" /></button>
            </form>
          </div>
          <form action={signOutAction} className="mt-4 text-center"><button type="submit" className="min-h-10 px-4 text-xs font-extrabold text-[var(--muted)]">Sign out and use another email</button></form>
        </div>
      </section>
    </main>
  );
}
