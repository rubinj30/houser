"use client";

import { ArrowLeft, ArrowRight, Bot, CheckCircle2, LoaderCircle, Send, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type RelatedWorkItem = {
  id: string;
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
  suggestedQuestions?: string[];
};

const starterQuestions = [
  "Are there any urgent items that need attention?",
  "Is anything needed for my A/C?",
  "When does the deck need to be stained?",
  "What is the status of the appliances in my house?",
];

function formatTarget(item: RelatedWorkItem) {
  if (!item.targetStartOn) return "Unscheduled";
  const start = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${item.targetStartOn}T12:00:00`));
  if (!item.targetEndOn || item.targetEndOn === item.targetStartOn) return start;
  const end = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${item.targetEndOn}T12:00:00`));
  return `${start} – ${end}`;
}

export function HouserChat({ userEmail, propertyName }: { userEmail: string; propertyName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome",
    role: "assistant",
    content: `Ask me about work, maintenance timing, assets, service history, or documents for ${propertyName}. I’ll answer from your Houser records and tell you when something isn’t known yet.`,
  }]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
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
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.id !== "welcome")
            .slice(-12)
            .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Houser could not answer that question.");
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        confidence: result.confidence,
        relatedWorkItems: result.relatedWorkItems,
        suggestedQuestions: result.suggestedQuestions,
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Houser could not answer that question.");
    } finally {
      setIsSending(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  return <div className="min-h-dvh bg-[var(--canvas)]">
    <header className="sticky top-0 z-20 border-b border-black/6 bg-[rgba(243,241,235,0.92)] px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><Link href="/" className="grid size-11 shrink-0 place-items-center rounded-xl border border-black/8 bg-white/70 text-[var(--forest)]" aria-label="Back to Houser"><ArrowLeft className="size-5"/></Link><div className="min-w-0"><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-xl bg-[var(--forest)] text-[var(--lime)]"><Sparkles className="size-4"/></div><h1 className="font-display truncate text-lg font-extrabold tracking-[-0.035em]">Ask Houser</h1></div><p className="mt-0.5 truncate text-[10px] font-bold text-[var(--muted)]">{propertyName} · grounded in your records</p></div></div>
        <div className="hidden items-center gap-2 rounded-xl bg-[var(--mint)]/65 px-3 py-2 text-[10px] font-extrabold text-[var(--forest)] sm:flex"><ShieldCheck className="size-4"/> Private household data</div>
      </div>
    </header>

    <main className="mx-auto flex min-h-[calc(100dvh-69px)] max-w-5xl flex-col px-3 sm:px-6">
      <section className="flex-1 space-y-5 py-5 sm:py-8" aria-live="polite" aria-label="Ask Houser conversation">
        {messages.map((message, index) => <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          {message.role === "assistant" ? <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--forest)] text-[var(--lime)]"><Bot className="size-4"/></div> : null}
          <div className={`max-w-[min(88%,44rem)] ${message.role === "user" ? "rounded-[22px] rounded-br-md bg-[var(--forest)] px-4 py-3 text-white" : "min-w-0"}`}>
            {message.role === "assistant" ? <div className="rounded-[22px] rounded-tl-md border border-black/6 bg-[var(--paper)] p-4 surface-shadow sm:p-5"><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>{message.confidence ? <p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold capitalize text-[var(--muted)]"><CheckCircle2 className="size-3.5 text-[var(--forest)]"/> {message.confidence} confidence from current records</p> : null}</div> : <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}
            {message.relatedWorkItems?.length ? <div className="mt-3 space-y-2"><p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Related work</p>{message.relatedWorkItems.map((item) => <Link key={item.id} href={`/?work=${encodeURIComponent(item.reference)}`} className="group flex items-center justify-between gap-3 rounded-[18px] border border-black/7 bg-white p-3.5 surface-shadow hover:border-[var(--forest)]/25"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--forest)]"><Wrench className="size-4"/></div><div className="min-w-0"><p className="truncate text-xs font-extrabold">{item.title}</p><p className="mt-1 truncate text-[10px] capitalize text-[var(--muted)]">{item.category ?? "General"} · {item.priority} · {formatTarget(item)}</p></div></div><ArrowRight className="size-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]"/></Link>)}</div> : null}
            {message.suggestedQuestions?.length && index === messages.length - 1 ? <div className="mt-3 flex flex-wrap gap-2">{message.suggestedQuestions.map((question) => <button key={question} type="button" onClick={() => void ask(question)} className="min-h-10 rounded-xl border border-[var(--forest)]/15 bg-[var(--mint)]/45 px-3 text-left text-xs font-bold text-[var(--forest)]">{question}</button>)}</div> : null}
          </div>
        </article>)}

        {messages.length === 1 ? <section className="mx-auto max-w-2xl pt-2"><p className="text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">Try asking</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{starterQuestions.map((question) => <button key={question} type="button" onClick={() => void ask(question)} className="flex min-h-14 items-center justify-between gap-3 rounded-[18px] border border-black/7 bg-white/65 px-4 py-3 text-left text-xs font-extrabold transition hover:-translate-y-0.5 hover:border-[var(--forest)]/20"><span>{question}</span><ArrowRight className="size-4 shrink-0 text-[var(--forest)]"/></button>)}</div></section> : null}
        {isSending ? <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-xl bg-[var(--forest)] text-[var(--lime)]"><Bot className="size-4"/></div><div className="flex items-center gap-2 rounded-[18px] bg-white px-4 py-3 text-xs font-bold text-[var(--muted)] surface-shadow"><LoaderCircle className="size-4 animate-spin text-[var(--forest)]"/> Reviewing your Houser records…</div></div> : null}
        {error ? <div role="alert" className="ml-11 rounded-[18px] bg-[#f8ddd7] px-4 py-3 text-xs font-bold text-[#8c3328]">{error}</div> : null}
        <div ref={endRef}/>
      </section>

      <footer className="sticky bottom-0 -mx-3 border-t border-black/6 bg-[rgba(243,241,235,0.94)] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <form onSubmit={submit} className="mx-auto flex max-w-3xl items-end gap-2 rounded-[20px] border border-black/8 bg-white p-2 surface-shadow"><label className="min-w-0 flex-1"><span className="sr-only">Ask a question about your house</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim()) void ask(draft); } }} rows={1} maxLength={4000} placeholder="Ask about A/C, the deck, urgent work…" className="max-h-36 min-h-11 w-full resize-none bg-transparent px-3 py-3 text-sm leading-5 outline-none"/></label><button type="submit" disabled={!draft.trim() || isSending} className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[var(--forest)] text-white disabled:opacity-35" aria-label="Send question"><Send className="size-[18px]"/></button></form>
        <p className="mt-2 text-center text-[9px] leading-4 text-[var(--muted)]">AI answers can be wrong. Verify safety-critical advice and contractor recommendations. Signed in as {userEmail}.</p>
      </footer>
    </main>
  </div>;
}
