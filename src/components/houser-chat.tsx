"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Circle, LoaderCircle, PencilLine, PlusCircle, Send, ShieldCheck, Sparkles, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import type { HouserChatAction } from "@/lib/houser-chat";

type RelatedWorkItem = {
  id: string;
  propertyId: string;
  reference: string;
  title: string;
  property: string;
  category: string | null;
  status: string;
  priority: string;
  targetStartOn: string | null;
  targetEndOn: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: "high" | "medium" | "low";
  relatedWorkItems?: RelatedWorkItem[];
  proposedAction?: HouserChatAction | null;
  actionApplying?: boolean;
  actionResult?: { message: string; href: string; title: string; kind: "property" | "work" };
  actionError?: string;
};

type ChatError = {
  message: string;
  actionUrl?: string;
};

function formatTarget(item: RelatedWorkItem) {
  if (!item.targetStartOn) return "Unscheduled";
  const start = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${item.targetStartOn}T12:00:00`));
  if (!item.targetEndOn || item.targetEndOn === item.targetStartOn) return start;
  const end = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${item.targetEndOn}T12:00:00`));
  return `${start} – ${end}`;
}

function proposedActionTitle(action: HouserChatAction) {
  if (action.type === "create_property") return "Create property";
  return action.type === "create_work_item" ? "Create work item" : "Update work item";
}

function proposedActionDetails(action: HouserChatAction) {
  if (action.type !== "create_property") return null;
  const location = [action.addressLine1, action.city, action.region, action.postalCode].filter(Boolean).join(", ");
  return `${action.displayName} · ${action.propertyType.replaceAll("_", " ")}${location ? ` · ${location}` : ""}`;
}

export function HouserChat({ userEmail, propertyName }: { userEmail: string; propertyName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isSending, messages]);

  const ask = async (question: string) => {
    const content = question.trim();
    if (!content || isSending) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .slice(-12)
            .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError({
          message: result.error ?? "Houser could not answer that question.",
          actionUrl: typeof result.actionUrl === "string" ? result.actionUrl : undefined,
        });
        return;
      }
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        confidence: result.confidence,
        relatedWorkItems: result.relatedWorkItems,
        proposedAction: result.proposedAction,
      }]);
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "Houser could not answer that question." });
    } finally {
      setIsSending(false);
    }
  };

  const applyAction = async (messageId: string, action: HouserChatAction) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, actionApplying: true, actionError: undefined } : message));
    try {
      const response = await fetch("/api/chat/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The change could not be saved.");
      const actionResult = action.type === "create_property"
        ? { message: result.message, href: `/?property=${encodeURIComponent(result.property.id)}`, title: result.property.displayName, kind: "property" as const }
        : { message: result.message, href: `/?property=${encodeURIComponent(result.workItem.propertyId)}&work=${encodeURIComponent(result.workItem.id)}`, title: result.workItem.title, kind: "work" as const };
      setMessages((current) => current.map((message) => message.id === messageId ? {
        ...message,
        actionApplying: false,
        proposedAction: null,
        actionResult,
      } : message));
    } catch (cause) {
      setMessages((current) => current.map((message) => message.id === messageId ? {
        ...message,
        actionApplying: false,
        actionError: cause instanceof Error ? cause.message : "The change could not be saved.",
      } : message));
    }
  };

  const dismissAction = (messageId: string) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, proposedAction: null, actionError: undefined } : message));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return <div className="min-h-dvh bg-[radial-gradient(circle_at_50%_-10%,rgba(212,231,109,0.18),transparent_30rem)]">
    <header className="sticky top-0 z-20 border-b border-black/6 bg-[rgba(243,241,235,0.88)] px-4 py-3 backdrop-blur-2xl sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><Link href="/" className="grid size-11 shrink-0 place-items-center rounded-full border border-black/8 bg-white/75 text-[var(--forest)] transition hover:bg-white" aria-label="Back to Houser"><ArrowLeft className="size-5"/></Link><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="font-display truncate text-lg font-extrabold tracking-[-0.035em]">Ask Houser</h1><span className="flex items-center gap-1 rounded-full bg-[var(--mint)] px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[var(--forest)]"><Circle className="size-1.5 fill-current"/> Ready</span></div><p className="mt-0.5 truncate text-[10px] font-bold text-[var(--muted)]">{propertyName} · your home records, in conversation</p></div></div>
        <div className="hidden items-center gap-2 rounded-xl bg-[var(--mint)]/65 px-3 py-2 text-[10px] font-extrabold text-[var(--forest)] sm:flex"><ShieldCheck className="size-4"/> Private household data</div>
      </div>
    </header>

    <main className="mx-auto flex min-h-[calc(100dvh-69px)] max-w-5xl flex-col px-3 sm:px-6">
      <section className="flex-1 space-y-6 py-6 sm:py-10" aria-live="polite" aria-label="Ask Houser conversation">
        {messages.length === 0 ? <section className="mx-auto flex max-w-2xl flex-col items-center px-4 pb-10 pt-[12vh] text-center"><div className="grid size-16 place-items-center rounded-[22px] bg-[var(--forest)] text-[var(--lime)] shadow-xl shadow-[#214f3e]/15"><Sparkles className="size-7"/></div><p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[var(--forest)]">Grounded in your Houser records</p><h2 className="font-display mt-3 text-3xl font-extrabold tracking-[-0.05em] sm:text-5xl">What would you like to know?</h2><p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">Ask naturally about maintenance, open work, service history, assets, or Documents. If you request a change, Houser will always show it for approval first.</p></section> : null}
        {messages.map((message) => <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[min(92%,46rem)] ${message.role === "user" ? "rounded-[24px] rounded-br-lg bg-[var(--forest)] px-4 py-3.5 text-white shadow-lg shadow-[#214f3e]/10 sm:px-5" : "min-w-0"}`}>
            {message.role === "assistant" ? <div className="rounded-[24px] rounded-tl-lg border border-black/6 bg-[rgba(252,251,248,0.92)] p-4 surface-shadow sm:p-6"><div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--forest)]"><span className="grid size-6 place-items-center rounded-lg bg-[var(--mint)]"><Sparkles className="size-3.5"/></span> Houser</div><MessageResponse className="text-sm leading-6 [&_li]:my-1 [&_ol]:my-3 [&_p]:my-2 [&_ul]:my-3">{message.content}</MessageResponse>{message.confidence ? <p className="mt-4 flex items-center gap-1.5 border-t border-black/6 pt-3 text-[10px] font-bold capitalize text-[var(--muted)]"><CheckCircle2 className="size-3.5 text-[var(--forest)]"/> {message.confidence} confidence from current records</p> : null}</div> : <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}
            {message.relatedWorkItems?.length ? <div className="mt-3 space-y-2"><p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Related work</p>{message.relatedWorkItems.map((item) => <Link key={item.id} href={`/?property=${encodeURIComponent(item.propertyId)}&work=${encodeURIComponent(item.id)}`} className="group flex items-center justify-between gap-3 rounded-[18px] border border-black/7 bg-white p-3.5 surface-shadow hover:border-[var(--forest)]/25"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--forest)]"><Wrench className="size-4"/></div><div className="min-w-0"><p className="truncate text-xs font-extrabold">{item.title}</p><p className="mt-1 truncate text-[10px] capitalize text-[var(--muted)]">{item.property} · {item.category ?? "General"} · {item.priority} · {formatTarget(item)}</p></div></div><ArrowRight className="size-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]"/></Link>)}</div> : null}
            {message.proposedAction ? <section className="mt-3 rounded-[18px] border border-[var(--forest)]/20 bg-[var(--mint)]/45 p-4" aria-label="Proposed Houser change"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--forest)] text-white">{message.proposedAction.type === "update_work_item" ? <PencilLine className="size-4"/> : <PlusCircle className="size-4"/>}</div><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--forest)]">Review before saving</p><h2 className="mt-1 text-sm font-extrabold">{proposedActionTitle(message.proposedAction)}</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{message.proposedAction.summary}</p>{proposedActionDetails(message.proposedAction) ? <p className="mt-2 text-xs font-extrabold capitalize text-[var(--ink)]">{proposedActionDetails(message.proposedAction)}</p> : null}</div></div>{message.actionError ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{message.actionError}</p> : null}<div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => dismissAction(message.id)} disabled={message.actionApplying} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white text-xs font-extrabold disabled:opacity-40"><X className="size-3.5"/> Not now</button><button type="button" onClick={() => void applyAction(message.id, message.proposedAction!)} disabled={message.actionApplying} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--forest)] px-3 text-xs font-extrabold text-white disabled:opacity-50">{message.actionApplying ? <LoaderCircle className="size-4 animate-spin"/> : <CheckCircle2 className="size-4"/>}{message.actionApplying ? "Saving…" : "Confirm & save"}</button></div></section> : null}
            {message.actionResult ? <Link href={message.actionResult.href} className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-[var(--forest)]/15 bg-white p-3.5 text-[var(--forest)] surface-shadow"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em]">{message.actionResult.kind === "property" ? "Property saved" : "Work saved"}</p><p className="mt-1 text-xs font-extrabold text-[var(--ink)]">{message.actionResult.title}</p></div><ArrowRight className="size-4"/></Link> : null}
          </div>
        </article>)}

        {isSending ? <div className="flex justify-start"><div className="flex items-center gap-2 rounded-[20px] rounded-tl-lg border border-black/6 bg-white/85 px-4 py-3 text-xs font-bold text-[var(--muted)] surface-shadow"><LoaderCircle className="size-4 animate-spin text-[var(--forest)]"/> Reviewing your Houser records…</div></div> : null}
        {error ? <div role="alert" className="rounded-[18px] bg-[#f8ddd7] px-4 py-3 text-xs font-bold text-[#8c3328]"><span>{error.message}</span>{error.actionUrl ? <a href={error.actionUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex min-h-8 items-center rounded-lg border border-[#8c3328]/20 bg-white/45 px-2.5 underline underline-offset-2">Open API billing</a> : null}</div> : null}
        <div ref={endRef}/>
      </section>

      <footer className="sticky bottom-0 -mx-3 bg-gradient-to-t from-[var(--canvas)] via-[var(--canvas)] to-transparent px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-6 sm:-mx-6 sm:px-6">
        <form onSubmit={submit} className="mx-auto flex max-w-3xl items-end gap-2 rounded-[24px] border border-black/8 bg-white/95 p-2.5 shadow-[0_20px_60px_rgba(25,42,34,0.14)] backdrop-blur-xl"><label className="min-w-0 flex-1"><span className="sr-only">Ask a question about your house</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim()) void ask(draft); } }} rows={1} maxLength={4000} placeholder="Message Houser…" className="max-h-36 min-h-11 w-full resize-none bg-transparent px-3 py-3 text-sm leading-5 outline-none"/></label><button type="submit" disabled={!draft.trim() || isSending} className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--forest)] text-white transition hover:bg-[var(--forest-dark)] disabled:opacity-35" aria-label="Send question"><Send className="size-[18px]"/></button></form>
        <p className="mt-2 text-center text-[9px] leading-4 text-[var(--muted)]">AI answers can be wrong. Verify safety-critical advice and contractor recommendations. Signed in as {userEmail}.</p>
      </footer>
    </main>
  </div>;
}
