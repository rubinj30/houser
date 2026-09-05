import { Bot, CheckCircle2, ExternalLink, Home, ShieldCheck } from "lucide-react";
import Link from "next/link";

const endpoint = "https://houser-flax.vercel.app/api/mcp";

export default function AgentAccessPage() {
  return (
    <main className="min-h-dvh px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--forest)]"><Home className="size-4" />Houser</Link>
        <section className="mt-6 rounded-[30px] border border-black/7 bg-[var(--paper)] p-6 surface-shadow sm:p-10">
          <div className="grid size-12 place-items-center rounded-2xl bg-[var(--forest)] text-[var(--lime)]"><Bot className="size-5" /></div>
          <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Agent access</p>
          <h1 className="font-display mt-3 text-4xl font-extrabold tracking-[-0.05em]">Use Houser from ChatGPT or Codex</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">Connect an AI client to Houser’s remote MCP server to find your properties and Work items without opening the portal. Writes still require your confirmation.</p>
          <div className="mt-7 rounded-2xl bg-black/[0.035] p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Remote MCP URL</p>
            <code className="mt-2 block overflow-x-auto text-sm font-bold text-[var(--forest)]">{endpoint}</code>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-black/7 p-5"><ShieldCheck className="size-5 text-[var(--forest)]" /><h2 className="mt-3 font-display text-lg font-extrabold">Private by default</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">OAuth signs the agent in as you. The same household membership and row-level security rules used by the portal apply.</p></article>
            <article className="rounded-2xl border border-black/7 p-5"><CheckCircle2 className="size-5 text-[var(--forest)]" /><h2 className="mt-3 font-display text-lg font-extrabold">Controlled changes</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Agents can search and read freely. Creating, editing, or completing work is described as a confirm-first action.</p></article>
          </div>
          <h2 className="font-display mt-9 text-2xl font-extrabold">Connect it</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
            <li><strong className="text-[var(--ink)]">1.</strong> Add the remote MCP URL in ChatGPT or your Codex MCP settings.</li>
            <li><strong className="text-[var(--ink)]">2.</strong> Choose Connect and sign in to Houser when prompted.</li>
            <li><strong className="text-[var(--ink)]">3.</strong> Review the requested access, then choose Allow access.</li>
          </ol>
          <a href="https://developers.openai.com/plugins/build/mcp-server" target="_blank" rel="noreferrer" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-extrabold text-[var(--forest)]">About MCP tools <ExternalLink className="size-4" /></a>
        </section>
      </div>
    </main>
  );
}
