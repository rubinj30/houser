"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileText,
  Flame,
  ExternalLink,
  Grid2X2,
  HardHat,
  Home,
  HousePlug,
  Image as ImageIcon,
  Layers3,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MoreHorizontal,
  MapPin,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Trees,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createManualWorkItemAction, getInspectionEvidenceAction, recordReviewUpdateAction, signOutAction } from "@/app/actions";
import {
  countBySeverity,
  filterFindings,
  formatSourcePages,
  groupByCategory,
  mergeFindings,
  severityLabels,
} from "@/lib/findings";
import type { Finding, InspectionEvidence, InspectionSeed, LocalWorkItem, ReviewActivity, ReviewStatus, Severity } from "@/lib/types";

type View = "home" | "work" | "timeline" | "assets";
type WorkIntent = {
  category: string;
  severity: Severity | "all";
  selectedReportId: string | null;
  revision: number;
};
const reviewStatusLabels: Record<ReviewStatus, string> = {
  needs_review: "Needs review",
  open: "Still needs work",
  completed: "Completed",
  deferred: "Deferred",
  not_applicable: "Not applicable",
};

const iconByCategory: Record<string, LucideIcon> = {
  Electrical: HousePlug,
  Exterior: Home,
  HVAC: Flame,
  "Landscaping and Grounds": Trees,
  Plumbing: Wrench,
  "Safety and Security": ShieldAlert,
  "Structure and Water Management": Layers3,
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "work", label: "Work", icon: ListTodo },
  { id: "timeline", label: "Timeline", icon: CalendarClock },
  { id: "assets", label: "Assets", icon: Grid2X2 },
];

export function HouserApp({ seed, propertyId, userEmail, initialReviewStatuses, initialReviewActivities }: { seed: InspectionSeed; propertyId: string; userEmail: string; initialReviewStatuses: Record<string, ReviewStatus>; initialReviewActivities: ReviewActivity[] }) {
  const [activeView, setActiveView] = useState<View>("home");
  const [property, setProperty] = useState<"ivy" | "rental">("ivy");
  const [isAdding, setIsAdding] = useState(false);
  const [localItems, setLocalItems] = useState<LocalWorkItem[]>([]);
  const [reviewStatuses, setReviewStatuses] = useState(initialReviewStatuses);
  const [reviewActivities, setReviewActivities] = useState(initialReviewActivities);
  const [workIntent, setWorkIntent] = useState<WorkIntent>({ category: "all", severity: "all", selectedReportId: null, revision: 0 });
  const allFindings = useMemo(() => mergeFindings(localItems, seed.findings), [localItems, seed.findings]);

  const recordReviewUpdate = async (reportId: string, status: ReviewStatus, note: string) => {
    const item = allFindings.find((finding) => finding.reportId === reportId);
    if (!item?.workItemId) throw new Error("This work item has not been connected to the database yet.");
    const result = await recordReviewUpdateAction({ workItemId: item.workItemId, reportId, status, note });
    setReviewStatuses((current) => ({ ...current, [reportId]: result.status }));
    setReviewActivities((current) => [result.activity, ...current]);
  };

  const changeView = (view: View) => {
    if (view === "work") {
      setWorkIntent((current) => ({ category: "all", severity: "all", selectedReportId: null, revision: current.revision + 1 }));
    }
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openWork = (intent: Partial<Omit<WorkIntent, "revision">> = {}) => {
    setWorkIntent((current) => ({
      category: intent.category ?? "all",
      severity: intent.severity ?? "all",
      selectedReportId: intent.selectedReportId ?? null,
      revision: current.revision + 1,
    }));
    setActiveView("work");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <DesktopSidebar activeView={activeView} workCount={allFindings.length} userEmail={userEmail} onChangeView={changeView} />
      <div className="min-w-0 pb-24 lg:pb-0">
        <TopBar property={property} userEmail={userEmail} setProperty={setProperty} onAdd={() => setIsAdding(true)} />
        <main className="mx-auto w-full max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">
          {property === "rental" ? (
            <EmptyRental onSwitch={() => setProperty("ivy")} />
          ) : activeView === "home" ? (
            <HomeView seed={seed} findings={allFindings} onOpenWork={openWork} />
          ) : activeView === "work" ? (
            <WorkView key={workIntent.revision} findings={allFindings} initialCategory={workIntent.category} initialSeverity={workIntent.severity} initialSelectedReportId={workIntent.selectedReportId} reviewStatuses={reviewStatuses} reviewActivities={reviewActivities} onRecordReview={recordReviewUpdate} />
          ) : activeView === "timeline" ? (
            <TimelineView findings={allFindings} reviewStatuses={reviewStatuses} reviewActivities={reviewActivities} onRecordReview={recordReviewUpdate} />
          ) : (
            <AssetsView seed={seed} />
          )}
        </main>
      </div>
      <MobileNav activeView={activeView} onChangeView={changeView} onAdd={() => setIsAdding(true)} />
      {isAdding ? (
        <AddWorkDialog
          seed={seed}
          onClose={() => setIsAdding(false)}
          onAdd={async (item) => {
            const created = await createManualWorkItemAction({ propertyId, title: item.title, category: item.category, area: item.area });
            setLocalItems((items) => [created, ...items]);
            setReviewStatuses((current) => ({ ...current, [created.reportId]: "needs_review" }));
          }}
        />
      ) : null}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-[14px] bg-[var(--lime)] text-[var(--forest-dark)]">
        <Home className="size-5" strokeWidth={2.4} aria-hidden="true" />
      </div>
      <div>
        <div className="font-display text-[19px] font-extrabold tracking-[-0.04em]">Houser</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Care for every corner</div>
      </div>
    </div>
  );
}

function DesktopSidebar({ activeView, workCount, userEmail, onChangeView }: { activeView: View; workCount: number; userEmail: string; onChangeView: (view: View) => void }) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col bg-[var(--forest-dark)] px-4 py-5 text-white lg:flex">
      <div className="px-2"><Brand /></div>
      <nav className="mt-10 space-y-1" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeView;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold transition ${active ? "bg-white text-[var(--forest-dark)] shadow-lg shadow-black/10" : "text-white/65 hover:bg-white/8 hover:text-white"}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-[19px]" strokeWidth={2} aria-hidden="true" />
              {item.label}
              {item.id === "work" ? <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${active ? "bg-[var(--mint)]" : "bg-white/10"}`}>{workCount}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2">
        <div className="grain rounded-2xl bg-white/8 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--lime)]"><Sparkles className="size-4" /> Synced workspace</div>
          <p className="mt-2 truncate text-xs text-white/65">{userEmail}</p>
          <p className="mt-1 text-xs leading-5 text-white/45">Status updates and notes are saved privately in Supabase.</p>
        </div>
        <form action={signOutAction}><button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-white/60 hover:bg-white/8 hover:text-white"><Settings className="size-[18px]" /> Sign out</button></form>
      </div>
    </aside>
  );
}

function TopBar({ property, userEmail, setProperty, onAdd }: { property: "ivy" | "rental"; userEmail: string; setProperty: (property: "ivy" | "rental") => void; onAdd: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/6 bg-[rgba(243,241,235,0.88)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
        <div className="lg:hidden"><div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-[var(--forest-dark)] text-[var(--lime)]"><Home className="size-[18px]" /></div><span className="font-display text-lg font-extrabold tracking-tight">Houser</span></div></div>
        <PropertySelect property={property} setProperty={setProperty} className="hidden sm:block" />
        <div className="flex items-center gap-2"><form action={signOutAction} className="lg:hidden"><button type="submit" aria-label={`Sign out ${userEmail}`} className="grid size-11 place-items-center rounded-xl border border-black/8 bg-white/65 text-[var(--muted)]"><LogOut className="size-[18px]" /></button></form><button type="button" onClick={onAdd} className="hidden min-h-11 items-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-bold text-white shadow-lg shadow-[#214f3e]/15 transition hover:-translate-y-0.5 hover:bg-[var(--forest-dark)] sm:flex"><Plus className="size-[18px]" /> Add work</button></div>
      </div>
      <PropertySelect property={property} setProperty={setProperty} className="mt-3 block sm:hidden" full />
    </header>
  );
}

function PropertySelect({ property, setProperty, className, full = false }: { property: "ivy" | "rental"; setProperty: (property: "ivy" | "rental") => void; className: string; full?: boolean }) {
  return (
    <label className={`relative ${className}`}>
      <span className="sr-only">Selected property</span>
      <select value={property} onChange={(event) => setProperty(event.target.value as "ivy" | "rental")} className={`h-11 appearance-none rounded-xl border border-black/8 bg-white/70 py-0 pl-4 pr-10 text-sm font-bold text-[var(--ink)] shadow-sm ${full ? "w-full" : ""}`}>
        <option value="ivy">Sample Home · Primary residence</option>
        <option value="rental">Rental property · Set up needed</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
    </label>
  );
}

function HomeView({ seed, findings, onOpenWork }: { seed: InspectionSeed; findings: Finding[]; onOpenWork: (intent?: Partial<Omit<WorkIntent, "revision">>) => void }) {
  const counts = countBySeverity(findings);
  const categories = groupByCategory(findings).slice(0, 6);
  const safetyItems = findings.filter((item) => item.severity === "safety_hazard").slice(0, 4);

  return (
    <div>
      <section className="enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]"><CircleDot className="size-3 fill-[var(--lime)]" /> Sample Home · Primary</div>
          <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.055em]">Your house, at a glance.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">Review the 2024 inspection, capture what has changed, and turn the remaining items into a clear plan.</p>
        </div>
        <button type="button" onClick={() => onOpenWork()} className="group flex min-h-11 items-center gap-2 self-start rounded-xl border border-black/8 bg-white px-4 text-sm font-bold surface-shadow sm:self-auto">View all work <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></button>
      </section>

      <section className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Property summary">
        <SummaryCard label="Needs review" value={findings.length} note="From inspection" icon={ClipboardCheck} tone="forest" />
        <SummaryCard label="Safety items" value={counts.safety_hazard} note="Verify first" icon={ShieldAlert} tone="rose" />
        <SummaryCard label="Maintenance" value={counts.maintenance_item} note="Recurring candidates" icon={Clock3} tone="amber" />
        <SummaryCard label="Tracked assets" value={seed.assets.length} note="From report" icon={HardHat} tone="lime" />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="enter enter-delay-1 grain overflow-hidden rounded-[28px] bg-[var(--forest)] text-white surface-shadow">
          <div className="grid min-h-[260px] gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--lime)]"><FileText className="size-4" /> Inspection ready</div>
                <h2 className="font-display mt-4 max-w-lg text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl">Turn the Sample Home report into your working plan.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Every finding keeps its page reference. Review what is still relevant, attach report captures, and record anything already completed.</p>
              </div>
              <button type="button" onClick={() => onOpenWork()} className="mt-6 flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[var(--lime)] px-4 text-sm font-extrabold text-[var(--forest-dark)] transition hover:brightness-105">Start review <ArrowRight className="size-4" /></button>
            </div>
            <ReportIllustration />
          </div>
        </div>

        <div className="enter enter-delay-2 rounded-[28px] border border-black/6 bg-[var(--paper)] p-6 surface-shadow sm:p-7">
          <div className="flex items-start justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--muted)]">Property health</p><div className="font-display mt-2 text-5xl font-extrabold tracking-[-0.06em]">—</div></div><div className="grid size-11 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--forest)]"><Sparkles className="size-5" /></div></div>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Complete the inspection review to establish a meaningful baseline.</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-black/6"><div className="h-full w-[12%] rounded-full bg-[var(--lime)]" /></div>
          <div className="mt-3 flex justify-between text-xs font-bold"><span>Setup progress</span><span className="text-[var(--muted)]">12%</span></div>
        </div>
      </section>

      <section className="mt-8 grid gap-7 xl:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionHeading eyebrow="Organize by system" title="Where the work lives" action="All categories" onAction={() => onOpenWork()} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{categories.map((category) => <CategoryCard key={category.category} {...category} onOpen={() => onOpenWork({ category: category.category })} />)}</div>
        </div>
        <div>
          <SectionHeading eyebrow="Review first" title="Safety findings" action={`See all ${counts.safety_hazard}`} onAction={() => onOpenWork({ severity: "safety_hazard" })} />
          <div className="mt-4 overflow-hidden rounded-[24px] border border-black/6 bg-[var(--paper)] surface-shadow">{safetyItems.map((item, index) => <CompactFinding key={item.reportId} item={item} last={index === safetyItems.length - 1} onOpen={() => onOpenWork({ severity: "safety_hazard", selectedReportId: item.reportId })} />)}</div>
        </div>
      </section>
    </div>
  );
}

function ReportIllustration() {
  return (
    <div className="relative hidden w-36 sm:block" aria-hidden="true">
      <div className="absolute right-1 top-2 h-44 w-28 rotate-6 rounded-xl bg-[#eae6db] shadow-2xl"><div className="m-3 h-2 w-12 rounded-full bg-[var(--forest)]/25" /><div className="mx-3 mt-4 space-y-2"><div className="h-1.5 rounded bg-black/10"/><div className="h-1.5 rounded bg-black/10"/><div className="h-1.5 w-2/3 rounded bg-black/10"/></div><div className="mx-3 mt-5 grid grid-cols-2 gap-2"><div className="aspect-square rounded-md bg-[var(--rose)]/30"/><div className="aspect-square rounded-md bg-[var(--amber)]/35"/></div></div>
      <div className="absolute right-12 top-9 h-44 w-28 -rotate-6 rounded-xl bg-white shadow-2xl"><div className="m-3 flex items-center gap-1.5"><div className="size-4 rounded bg-[var(--forest)]"/><div className="h-1.5 w-10 rounded bg-black/20"/></div><div className="mx-3 mt-4 h-14 rounded-lg bg-[var(--mint)]"/><div className="mx-3 mt-3 space-y-2"><div className="h-1.5 rounded bg-black/10"/><div className="h-1.5 rounded bg-black/10"/><div className="h-1.5 w-3/4 rounded bg-black/10"/></div></div>
    </div>
  );
}

function SummaryCard({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: LucideIcon; tone: "forest" | "rose" | "amber" | "lime" }) {
  const tones = { forest: "bg-[var(--forest)] text-white", rose: "bg-[#f8ddd7] text-[#8c3328]", amber: "bg-[#f9e6c8] text-[#84581b]", lime: "bg-[var(--lime)] text-[var(--forest-dark)]" };
  return <article className={`enter min-h-32 rounded-[22px] p-4 surface-shadow sm:min-h-36 sm:p-5 ${tones[tone]}`}><div className="flex items-start justify-between gap-2"><div className="text-xs font-extrabold uppercase tracking-[0.1em] opacity-65">{label}</div><Icon className="size-[18px] opacity-70" /></div><div className="font-display mt-3 text-4xl font-extrabold tracking-[-0.06em] sm:text-5xl">{value}</div><div className="mt-1 text-[11px] font-bold opacity-60 sm:text-xs">{note}</div></article>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) {
  return <div className="flex items-end justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">{eyebrow}</p><h2 className="font-display mt-1 text-xl font-extrabold tracking-[-0.035em] sm:text-2xl">{title}</h2></div><button type="button" onClick={onAction} className="text-xs font-extrabold text-[var(--forest)] hover:underline">{action}</button></div>;
}

function CategoryCard({ category, count, urgent, onOpen }: { category: string; count: number; urgent: number; onOpen: () => void }) {
  const Icon = iconByCategory[category] ?? Wrench;
  return <button type="button" onClick={onOpen} className="group w-full rounded-[20px] border border-black/6 bg-[var(--paper)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--forest)]/20 surface-shadow" aria-label={`View ${category} work`}><div className="flex items-start justify-between"><div className="grid size-9 place-items-center rounded-xl bg-[var(--mint)] text-[var(--forest)]"><Icon className="size-[18px]" /></div>{urgent ? <span className="rounded-full bg-[#f8ddd7] px-2 py-1 text-[10px] font-extrabold text-[#8c3328]">{urgent} urgent</span> : null}</div><h3 className="mt-4 min-h-9 text-sm font-extrabold leading-tight group-hover:text-[var(--forest)]">{category}</h3><p className="mt-2 flex items-center justify-between text-xs font-bold text-[var(--muted)]"><span>{count} {count === 1 ? "item" : "items"}</span><ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></p></button>;
}

function CompactFinding({ item, last, onOpen }: { item: Finding; last: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className={`group flex w-full gap-3 p-4 text-left transition hover:bg-[var(--mint)]/35 sm:p-5 ${last ? "" : "border-b border-black/6"}`} aria-label={`Open ${item.title}`}><div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#f8ddd7] text-[#a33e32]"><AlertTriangle className="size-[17px]" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-extrabold leading-5 group-hover:text-[var(--forest)]">{item.title}</h3><ArrowRight className="size-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]" /></div><p className="mt-1 truncate text-xs text-[var(--muted)]">{item.location}</p><div className="mt-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]"><Camera className="size-3" /> {formatSourcePages(item.sourcePages)}</div></div></button>;
}

function WorkView({ findings, initialCategory, initialSeverity, initialSelectedReportId, reviewStatuses, reviewActivities, onRecordReview }: { findings: Finding[]; initialCategory: string; initialSeverity: Severity | "all"; initialSelectedReportId: string | null; reviewStatuses: Record<string, ReviewStatus>; reviewActivities: ReviewActivity[]; onRecordReview: (reportId: string, status: ReviewStatus, note: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">(initialSeverity);
  const [category, setCategory] = useState(initialCategory);
  const [selectedItem, setSelectedItem] = useState<Finding | null>(() => findings.find((item) => item.reportId === initialSelectedReportId) ?? null);
  const [requestedStatus, setRequestedStatus] = useState<ReviewStatus | null>(null);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(findings.map((item) => item.category))].sort(), [findings]);
  const filtered = useMemo(() => filterFindings(findings, { query, severity, category }), [findings, query, severity, category]);

  return (
    <>
    <div className="enter">
      <PageHeading eyebrow="Inspection inbox" title="Work to review" description="Confirm what is still relevant before these findings become active work." />
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1"><span className="sr-only">Search work</span><Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[var(--muted)]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work, areas, or actions" className="h-12 w-full rounded-2xl border border-black/8 bg-[var(--paper)] pl-11 pr-4 text-sm outline-none surface-shadow" /></label>
        <label className="relative"><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-12 w-full appearance-none rounded-2xl border border-black/8 bg-[var(--paper)] pl-4 pr-10 text-sm font-bold lg:w-56"><option value="all">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/></label>
      </div>
      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Severity filters">{(["all", "safety_hazard", "recommendation", "maintenance_item"] as const).map((value) => <button key={value} type="button" onClick={() => setSeverity(value)} className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-extrabold ${severity === value ? "bg-[var(--forest)] text-white" : "border border-black/7 bg-white/60 text-[var(--muted)]"}`}>{value === "all" ? `All ${findings.length}` : severityLabels[value]}</button>)}</div>
      <div className="mt-5 flex items-center justify-between"><p className="text-xs font-bold text-[var(--muted)]">Showing {filtered.length} items</p><span className="text-xs font-bold text-[var(--muted)]">Newest source first</span></div>
      <div className="mt-2 grid gap-3 xl:grid-cols-2">{filtered.map((item) => <FindingCard key={item.workItemId ?? item.reportId} item={item} status={reviewStatuses[item.reportId] ?? "needs_review"} menuOpen={menuItemId === item.reportId} onOpen={() => { setMenuItemId(null); setRequestedStatus(null); setSelectedItem(item); }} onToggleMenu={() => setMenuItemId((current) => current === item.reportId ? null : item.reportId)} onSetStatus={(status) => { setMenuItemId(null); setRequestedStatus(status); setSelectedItem(item); }} />)}</div>
      {filtered.length === 0 ? <div className="mt-8 rounded-[24px] border border-dashed border-black/15 p-10 text-center"><Search className="mx-auto size-7 text-[var(--muted)]"/><h2 className="font-display mt-3 text-lg font-extrabold">No matching work</h2><p className="mt-1 text-sm text-[var(--muted)]">Try another search or clear a filter.</p></div> : null}
    </div>
    {selectedItem ? <FindingReviewDialog key={`${selectedItem.reportId}-${requestedStatus ?? "details"}`} item={selectedItem} status={reviewStatuses[selectedItem.reportId] ?? "needs_review"} activities={reviewActivities.filter((activity) => activity.reportId === selectedItem.reportId)} initialStatus={requestedStatus} onClose={() => { setSelectedItem(null); setRequestedStatus(null); }} onRecordReview={(status, note) => onRecordReview(selectedItem.reportId, status, note)} /> : null}
    </>
  );
}

function FindingCard({ item, status, menuOpen, onOpen, onToggleMenu, onSetStatus }: { item: Finding; status: ReviewStatus; menuOpen: boolean; onOpen: () => void; onToggleMenu: () => void; onSetStatus: (status: ReviewStatus) => void }) {
  const tone = item.severity === "safety_hazard" ? "bg-[#f8ddd7] text-[#96382d]" : item.severity === "maintenance_item" ? "bg-[#f9e6c8] text-[#84581b]" : "bg-[var(--mint)] text-[var(--forest)]";
  return <article className="group relative rounded-[22px] border border-black/6 bg-[var(--paper)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--forest)]/20 surface-shadow"><div className="flex items-start gap-3"><div className={`grid size-10 shrink-0 place-items-center rounded-[14px] ${tone}`}>{item.severity === "safety_hazard" ? <AlertTriangle className="size-[18px]"/> : item.severity === "maintenance_item" ? <Clock3 className="size-[18px]"/> : <ClipboardCheck className="size-[18px]"/>}</div><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap gap-2"><span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">{item.reportId} · {item.category}</span>{"isLocal" in item ? <span className="rounded-full bg-[var(--lime)] px-2 text-[9px] font-extrabold uppercase">New</span> : null}</div><h2 className="mt-1 text-[15px] font-extrabold leading-5 group-hover:text-[var(--forest)]">{item.title}</h2></button><div className="relative"><button type="button" onClick={onToggleMenu} aria-label={`More options for ${item.title}`} aria-expanded={menuOpen} className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5"><MoreHorizontal className="size-5"/></button>{menuOpen ? <FindingMenu onOpen={onOpen} onSetStatus={onSetStatus} /> : null}</div></div><button type="button" onClick={onOpen} className="block w-full text-left"><p className="mt-4 text-sm leading-6 text-[var(--muted)]">{item.suggestedAction}</p><div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${tone}`}>{severityLabels[item.severity]}</span><span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-extrabold text-[var(--muted)]">{item.area}</span><ReviewStatusPill status={status} /></div></button><div className="mt-4 flex items-center justify-between border-t border-black/6 pt-3"><button type="button" onClick={onOpen} className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--forest)]"><ImageIcon className="size-3.5"/> {item.sourcePages.length ? formatSourcePages(item.sourcePages) : "Manual entry"}</button><button type="button" onClick={onOpen} className="min-h-9 rounded-lg px-2 text-xs font-extrabold text-[var(--forest)] hover:bg-[var(--mint)]">Review item</button></div></article>;
}

function FindingMenu({ onOpen, onSetStatus }: { onOpen: () => void; onSetStatus: (status: ReviewStatus) => void }) {
  return <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-black/8 bg-white p-1.5 shadow-xl" role="menu"><button type="button" onClick={onOpen} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold hover:bg-black/5" role="menuitem">Open details</button><button type="button" onClick={() => onSetStatus("completed")} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold hover:bg-black/5" role="menuitem">Mark completed</button><button type="button" onClick={() => onSetStatus("deferred")} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold hover:bg-black/5" role="menuitem">Defer for later</button><button type="button" onClick={() => onSetStatus("not_applicable")} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold text-[var(--muted)] hover:bg-black/5" role="menuitem">Not applicable</button></div>;
}

function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  const style = status === "completed" ? "bg-[#dcefdc] text-[#246235]" : status === "open" ? "bg-[#e6efe9] text-[var(--forest)]" : status === "deferred" ? "bg-[#eee9dc] text-[#6f6041]" : status === "not_applicable" ? "bg-black/5 text-[var(--muted)]" : "bg-white text-[var(--muted)] ring-1 ring-black/8";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${style}`}>{reviewStatusLabels[status]}</span>;
}

function FindingReviewDialog({ item, status, activities, initialStatus, onClose, onRecordReview }: { item: Finding; status: ReviewStatus; activities: ReviewActivity[]; initialStatus: ReviewStatus | null; onClose: () => void; onRecordReview: (status: ReviewStatus, note: string) => Promise<void> }) {
  const [pendingStatus, setPendingStatus] = useState<ReviewStatus | null>(initialStatus);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const saveUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingStatus) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await onRecordReview(pendingStatus, note);
      setPendingStatus(null);
      setNote("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The update could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-end bg-[#0d1e17]/45 backdrop-blur-sm sm:p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="finding-review-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--paper)] shadow-2xl sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-[28px]"><div className="sticky top-0 z-10 flex items-start justify-between border-b border-black/6 bg-[rgba(252,251,248,0.94)] p-5 backdrop-blur-xl sm:p-7"><div className="pr-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--forest)]">{item.reportId} · {item.category}</p><h2 id="finding-review-title" className="font-display mt-2 text-2xl font-extrabold leading-tight tracking-[-0.04em]">{item.title}</h2><div className="mt-3"><ReviewStatusPill status={status} /></div></div><button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/5 hover:bg-black/10" aria-label="Close review"><X className="size-5"/></button></div><div className="space-y-6 p-5 sm:p-7"><section><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Inspector recommendation</p><p className="mt-2 text-sm leading-6">{item.suggestedAction}</p></section><dl className="grid grid-cols-2 gap-3"><Detail label="Area" value={item.area} /><Detail label="Location" value={item.location} icon={MapPin} /><Detail label="Priority" value={item.priority} /><Detail label="Work type" value={item.workType} /></dl><InspectionEvidenceCard item={item} /><section><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Owner review</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Confirm the current condition before turning this historical inspection finding into active work.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setPendingStatus("open")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-extrabold text-white"><ClipboardCheck className="size-[18px]"/> Still needs work</button><button type="button" onClick={() => setPendingStatus("completed")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-extrabold"><CheckCircle2 className="size-[18px]"/> Already completed</button><button type="button" onClick={() => setPendingStatus("deferred")} className="min-h-11 rounded-xl border border-black/8 px-4 text-xs font-extrabold">Defer for later</button><button type="button" onClick={() => setPendingStatus("not_applicable")} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] hover:bg-black/5">Not applicable</button></div>{pendingStatus ? <StatusUpdateForm status={pendingStatus} note={note} isSaving={isSaving} error={saveError} onNoteChange={setNote} onCancel={() => { setPendingStatus(null); setNote(""); setSaveError(""); }} onSubmit={saveUpdate} /> : null}<p className="mt-3 text-center text-[10px] font-bold text-[var(--muted)]">Synced privately · changes appear for every household member.</p></section><ActivityHistory activities={activities} /></div></section></div>;
}

/* Signed private previews expire quickly, so browser-native images avoid a server-side optimizer caching private URLs. */
/* eslint-disable @next/next/no-img-element */
function InspectionEvidenceCard({ item }: { item: Finding }) {
  const [evidence, setEvidence] = useState<InspectionEvidence | null>(null);
  const [selectedPage, setSelectedPage] = useState(item.sourcePages[0] ?? 0);
  const [loadError, setLoadError] = useState("");
  const [isPending, startTransition] = useTransition();

  const loadEvidence = () => {
    if (!item.workItemId || item.sourcePages.length === 0) return;
    setLoadError("");
    startTransition(() => {
      void getInspectionEvidenceAction({ workItemId: item.workItemId! })
        .then((result) => setEvidence(result))
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Evidence could not be loaded."));
    });
  };

  useEffect(() => {
    const workItemId = item.workItemId;
    if (!workItemId || item.sourcePages.length === 0) return;
    startTransition(() => {
      void getInspectionEvidenceAction({ workItemId })
        .then((result) => setEvidence(result))
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Evidence could not be loaded."));
    });
  }, [item.sourcePages.length, item.workItemId]);

  const activePage = evidence?.pages.find((page) => page.pageNumber === selectedPage) ?? evidence?.pages[0];

  return <section className="rounded-[22px] border border-black/7 bg-white/65 p-4"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--forest)]"><ImageIcon className="size-[18px]"/></div><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">Inspection evidence</p><p className="mt-1 text-sm font-bold text-[var(--forest)]">{item.sourcePages.length ? formatSourcePages(item.sourcePages) : "Manual entry"}</p></div></div>{item.sourcePages.length === 0 ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">This manually added item does not have an inspection source.</p> : isPending ? <div className="mt-4 space-y-3" aria-live="polite"><div className="aspect-[8.5/11] animate-pulse rounded-2xl bg-black/6"/><p className="text-xs font-bold text-[var(--muted)]">Loading private report evidence…</p></div> : loadError ? <div className="mt-4 rounded-2xl bg-[#f8ddd7] p-4"><p role="alert" className="text-xs font-bold text-[#8c3328]">{loadError}</p><button type="button" onClick={loadEvidence} className="mt-3 min-h-10 rounded-xl bg-white px-4 text-xs font-extrabold">Try again</button></div> : activePage ? <div className="mt-4"><a href={activePage.reportUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-2xl border border-black/8 bg-[#efede7]" aria-label={`Open inspection report at page ${activePage.pageNumber}`}><div className="relative aspect-[8.5/11] overflow-hidden"><img src={activePage.previewUrl} alt={`Inspection report page ${activePage.pageNumber}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.01]" loading="lazy"/><div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-[rgba(13,30,23,0.88)] px-3 py-2 text-xs font-extrabold text-white backdrop-blur"><span>Page {activePage.pageNumber}</span><span className="flex items-center gap-1.5">Open report <ExternalLink className="size-3.5"/></span></div></div></a>{evidence && evidence.pages.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Inspection evidence pages">{evidence.pages.map((page) => <button key={page.pageNumber} type="button" onClick={() => setSelectedPage(page.pageNumber)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-extrabold ${activePage.pageNumber === page.pageNumber ? "bg-[var(--forest)] text-white" : "border border-black/8 bg-white"}`}>Page {page.pageNumber}</button>)}</div> : null}<p className="mt-3 truncate text-[10px] font-bold text-[var(--muted)]">{evidence?.documentName} · private link expires in 5 minutes</p></div> : <div className="mt-4 rounded-2xl border border-dashed border-black/10 p-4"><p className="text-xs leading-5 text-[var(--muted)]">The page reference is preserved, but this report has not been connected to private storage yet.</p></div>}</section>;
}
/* eslint-enable @next/next/no-img-element */

function StatusUpdateForm({ status, note, isSaving, error, onNoteChange, onCancel, onSubmit }: { status: ReviewStatus; note: string; isSaving: boolean; error: string; onNoteChange: (note: string) => void; onCancel: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const prompts: Partial<Record<ReviewStatus, string>> = {
    open: "What did you observe?",
    completed: "What was done?",
    deferred: "Why was this deferred, and when should it be reconsidered?",
    not_applicable: "Why doesn't this apply?",
  };
  return <form onSubmit={onSubmit} className="mt-4 rounded-[20px] border border-[var(--forest)]/15 bg-[var(--mint)]/55 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--forest)]">Update status</p><p className="mt-1 text-sm font-extrabold">{reviewStatusLabels[status]}</p></div><ReviewStatusPill status={status} /></div><label className="mt-4 block"><span className="text-xs font-extrabold">{prompts[status] ?? "Add a note"} <span className="font-medium text-[var(--muted)]">(optional)</span></span><textarea autoFocus value={note} onChange={(event) => onNoteChange(event.target.value)} rows={4} placeholder="Add details that will help you understand this update later…" className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm leading-5 outline-none focus:border-[var(--forest)]/40" /></label>{error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}<div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={isSaving} onClick={onCancel} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] hover:bg-black/5 disabled:opacity-50">Cancel</button><button type="submit" disabled={isSaving} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white disabled:opacity-60">{isSaving ? "Saving…" : "Save update"}</button></div></form>;
}

function ActivityHistory({ activities }: { activities: ReviewActivity[] }) {
  return <section><div className="flex items-center gap-2"><MessageSquareText className="size-4 text-[var(--forest)]"/><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Activity history</p></div>{activities.length ? <ol className="mt-3 space-y-3">{activities.map((activity) => <li key={activity.id} className="rounded-[18px] border border-black/6 bg-white/65 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><ReviewStatusPill status={activity.status} /><time className="text-[10px] font-bold text-[var(--muted)]" dateTime={activity.createdAt}>{formatActivityDate(activity.createdAt)}</time></div>{activity.note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{activity.note}</p> : <p className="mt-3 text-xs italic text-[var(--muted)]">Status updated without a note.</p>}</li>)}</ol> : <div className="mt-3 rounded-[18px] border border-dashed border-black/10 p-4 text-sm text-[var(--muted)]">No updates recorded yet.</div>}</section>;
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return <div className="rounded-2xl bg-black/[0.035] p-3"><dt className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">{Icon ? <Icon className="size-3"/> : null}{label}</dt><dd className="mt-1 break-words text-xs font-bold capitalize">{value.replaceAll("_", " ")}</dd></div>;
}

function TimelineView({ findings, reviewStatuses, reviewActivities, onRecordReview }: { findings: Finding[]; reviewStatuses: Record<string, ReviewStatus>; reviewActivities: ReviewActivity[]; onRecordReview: (reportId: string, status: ReviewStatus, note: string) => Promise<void> }) {
  const [selectedItem, setSelectedItem] = useState<Finding | null>(null);
  const safety = findings.filter((item) => item.severity === "safety_hazard");
  const important = findings.filter((item) => item.priority === "important" && item.severity !== "safety_hazard");
  const routine = findings.filter((item) => item.priority === "routine" || item.priority === "informational");
  return <><div className="enter"><PageHeading eyebrow="Plan by time" title="Maintenance timeline" description="The initial report has no trusted due dates yet, so work is grouped by recommended review horizon." /><div className="mt-8 max-w-4xl space-y-8"><TimelineGroup label="Verify first" note="Safety findings · review now" color="rose" items={safety} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /><TimelineGroup label="Plan next" note="Important recommendations · schedule after review" color="amber" items={important.slice(0, 8)} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /><TimelineGroup label="Routine & long-term" note="Maintenance, monitoring, and cosmetic work" color="forest" items={routine.slice(0, 8)} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /></div></div>{selectedItem ? <FindingReviewDialog item={selectedItem} status={reviewStatuses[selectedItem.reportId] ?? "needs_review"} activities={reviewActivities.filter((activity) => activity.reportId === selectedItem.reportId)} initialStatus={null} onClose={() => setSelectedItem(null)} onRecordReview={(status, note) => onRecordReview(selectedItem.reportId, status, note)} /> : null}</>;
}

function TimelineGroup({ label, note, color, items, reviewStatuses, onOpen }: { label: string; note: string; color: "rose" | "amber" | "forest"; items: Finding[]; reviewStatuses: Record<string, ReviewStatus>; onOpen: (item: Finding) => void }) {
  const colors = { rose: "bg-[var(--rose)]", amber: "bg-[var(--amber)]", forest: "bg-[var(--forest)]" };
  return <section className="grid gap-4 sm:grid-cols-[150px_1fr]"><div><div className="flex items-center gap-2"><div className={`size-2.5 rounded-full ${colors[color]}`}/><h2 className="font-display text-base font-extrabold">{label}</h2></div><p className="ml-[18px] mt-1 text-xs leading-5 text-[var(--muted)]">{note}</p></div><div className="relative space-y-3 before:absolute before:-left-[22px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-black/10">{items.map((item) => <button type="button" key={item.reportId} onClick={() => onOpen(item)} className="group block w-full rounded-[20px] border border-black/6 bg-[var(--paper)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--forest)]/20 surface-shadow"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">{item.category} · {item.reportId}</div><h3 className="mt-1 text-sm font-extrabold group-hover:text-[var(--forest)]">{item.title}</h3><p className="mt-1 text-xs text-[var(--muted)]">{item.location}</p><div className="mt-2"><ReviewStatusPill status={reviewStatuses[item.reportId] ?? "needs_review"} /></div></div><ArrowRight className="mt-1 size-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]"/></div></button>)}</div></section>;
}

function AssetsView({ seed }: { seed: InspectionSeed }) {
  const grouped = Object.entries(seed.assets.reduce<Record<string, InspectionSeed["assets"]>>((groups, asset) => { (groups[asset.category] ??= []).push(asset); return groups; }, {}));
  return <div className="enter"><PageHeading eyebrow="What the house contains" title="Assets & systems" description={`${seed.assets.length} assets were identified from the inspection report. Verify model and installation details as you review them.`} /><div className="mt-7 grid gap-4 lg:grid-cols-2">{grouped.map(([category, assets]) => { const Icon = iconByCategory[category] ?? HardHat; return <section key={category} className="rounded-[24px] border border-black/6 bg-[var(--paper)] p-5 surface-shadow"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-[14px] bg-[var(--mint)] text-[var(--forest)]"><Icon className="size-[19px]"/></div><div><h2 className="font-display text-base font-extrabold">{category}</h2><p className="text-xs text-[var(--muted)]">{assets.length} {assets.length === 1 ? "asset" : "assets"}</p></div></div><div className="mt-4 divide-y divide-black/6">{assets.map((asset) => <div key={asset.key} className="flex items-center justify-between gap-3 py-3"><div><h3 className="text-sm font-bold">{asset.name}</h3><p className="mt-0.5 text-xs text-[var(--muted)]">{asset.area}{asset.manufacturedYear ? ` · ${asset.manufacturedYear}` : asset.installedYear ? ` · Installed ~${asset.installedYear}` : ""}</p></div><button type="button" className="grid size-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5" aria-label={`View ${asset.name}`}><ArrowRight className="size-4"/></button></div>)}</div></section>; })}</div></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">{eyebrow}</p><h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.05em] sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p></header>;
}

function MobileNav({ activeView, onChangeView, onAdd }: { activeView: View; onChangeView: (view: View) => void; onAdd: () => void }) {
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-black/8 bg-[rgba(252,251,248,0.94)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">{navItems.slice(0, 2).map((item) => <MobileNavButton key={item.id} item={item} active={activeView === item.id} onClick={() => onChangeView(item.id)} />)}<button type="button" onClick={onAdd} className="mx-auto -mt-7 grid size-14 place-items-center rounded-[20px] bg-[var(--forest)] text-white shadow-xl shadow-[#214f3e]/25" aria-label="Add work"><Plus className="size-6"/></button>{navItems.slice(2).map((item) => <MobileNavButton key={item.id} item={item} active={activeView === item.id} onClick={() => onChangeView(item.id)} />)}</nav>;
}

function MobileNavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button type="button" onClick={onClick} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-extrabold ${active ? "text-[var(--forest)]" : "text-[var(--muted)]"}`} aria-current={active ? "page" : undefined}><Icon className="size-5" strokeWidth={active ? 2.5 : 1.9}/>{item.label}</button>;
}

function EmptyRental({ onSwitch }: { onSwitch: () => void }) {
  return <div className="mx-auto mt-8 max-w-xl rounded-[28px] border border-dashed border-black/15 bg-white/50 p-8 text-center sm:p-12"><div className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[var(--mint)] text-[var(--forest)]"><Home className="size-6"/></div><h1 className="font-display mt-5 text-2xl font-extrabold tracking-tight">Set up the rental property</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">When you share the second inspection report, this property can be seeded the same way as Sample Home.</p><button type="button" onClick={onSwitch} className="mt-6 min-h-11 rounded-xl bg-[var(--forest)] px-5 text-sm font-extrabold text-white">Return to Sample Home</button></div>;
}

function AddWorkDialog({ seed, onClose, onAdd }: { seed: InspectionSeed; onClose: () => void; onAdd: (item: LocalWorkItem) => Promise<void> }) {
  const categories = [...new Set(seed.findings.map((item) => item.category))].sort();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "General");
  const [area, setArea] = useState(seed.areas[0] ?? "General");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await onAdd({ reportId: `manual-${Date.now()}`, title: title.trim(), category, area, workType: "other", severity: "recommendation", priority: "routine", location: area, suggestedAction: "Review this manually added work item and add scheduling details.", sourcePages: [], isLocal: true });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The work item could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 grid items-end bg-[#0d1e17]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="add-work-title" className="w-full rounded-t-[28px] bg-[var(--paper)] p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Quick capture</p><h2 id="add-work-title" className="font-display mt-1 text-2xl font-extrabold tracking-tight">Add work</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-black/5" aria-label="Close"><X className="size-5"/></button></div><form onSubmit={submit} className="mt-6 space-y-4"><label className="block"><span className="text-xs font-extrabold">What needs to be done?</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Service upstairs furnace" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm"/></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="text-xs font-extrabold">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{categories.map((name) => <option key={name}>{name}</option>)}</select></label><label><span className="text-xs font-extrabold">Area</span><select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{seed.areas.map((name) => <option key={name}>{name}</option>)}</select></label></div><button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 text-sm font-bold text-[var(--muted)]"><Camera className="size-[18px]"/> Add photo or screenshot</button>{saveError ? <p role="alert" className="rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{saveError}</p> : null}<button type="submit" disabled={!title.trim() || isSaving} className="min-h-12 w-full rounded-xl bg-[var(--forest)] text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">{isSaving ? "Saving…" : "Save to work inbox"}</button></form></div></div>;
}
