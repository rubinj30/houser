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
  Download,
  FileText,
  Flame,
  Grid2X2,
  HardHat,
  Home,
  HousePlug,
  Image as ImageIcon,
  ExternalLink,
  Layers3,
  LayoutDashboard,
  Link2,
  ListTodo,
  LogOut,
  MoreHorizontal,
  MapPin,
  MessageSquareText,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Trees,
  Upload,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { completeWorkItemAction, createManualWorkItemAction, getInspectionEvidenceAction, getLinkedWorkDocumentsAction, recordReviewUpdateAction, saveDocumentWorkDestinationAction, signOutAction } from "@/app/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { buildGoogleCalendarUrl, buildIcsCalendar, calendarFilename, type CalendarProperty } from "@/lib/calendar";
import type { NormalizedDocument } from "@/lib/document-extraction";
import type { InspectionExtraction } from "@/lib/inspection-extraction";
import type { PhotoExtraction } from "@/lib/photo-extraction";
import {
  countBySeverity,
  filterFindings,
  formatSourcePages,
  groupByCategory,
  mergeFindings,
  severityLabels,
} from "@/lib/findings";
import type { Finding, InspectionEvidence, InspectionSeed, LinkedWorkDocument, LocalWorkItem, PropertySummary, ReviewActivity, ReviewStatus, ServiceRecord, Severity, WorkCompletionInput } from "@/lib/types";
import { isClosedReviewStatus } from "@/lib/work-status";

type View = "home" | "work" | "timeline" | "assets";
type WorkIntent = {
  category: string;
  severity: Severity | "all";
  selectedReportId: string | null;
  revision: number;
};
type CompletionDetails = Omit<WorkCompletionInput, "workItemId" | "reportId">;
type RelatedWorkGroup = {
  group: { id: string; label: string } | null;
  relatedItems: Array<{
    id: string;
    title: string;
    sourceSection: string | null;
    category: string | null;
    status: string;
    priority: string;
  }>;
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

export function HouserApp({ seed, propertyId, selectedPropertyId, properties, userEmail, hasInspectionDocument, initialWorkReportId, initialReviewStatuses, initialReviewActivities, initialServiceRecords }: { seed: InspectionSeed; propertyId: string | null; selectedPropertyId: string | "all"; properties: PropertySummary[]; userEmail: string; hasInspectionDocument: boolean; initialWorkReportId: string | null; initialReviewStatuses: Record<string, ReviewStatus>; initialReviewActivities: ReviewActivity[]; initialServiceRecords: ServiceRecord[] }) {
  const router = useRouter();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const initialWorkItem = seed.findings.find((item) => item.reportId === initialWorkReportId || item.workItemId === initialWorkReportId);
  const [activeView, setActiveView] = useState<View>(initialWorkItem ? "work" : "home");
  const [isAdding, setIsAdding] = useState(false);
  const [isUploadingInspection, setIsUploadingInspection] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<Finding | null>(null);
  const [localItems, setLocalItems] = useState<LocalWorkItem[]>([]);
  const [reviewStatuses, setReviewStatuses] = useState(initialReviewStatuses);
  const [reviewActivities, setReviewActivities] = useState(initialReviewActivities);
  const [serviceRecords, setServiceRecords] = useState(initialServiceRecords);
  const [workIntent, setWorkIntent] = useState<WorkIntent>({ category: "all", severity: "all", selectedReportId: initialWorkItem?.reportId ?? null, revision: 0 });
  const allFindings = useMemo(() => mergeFindings(localItems, seed.findings), [localItems, seed.findings]);
  const currentFindings = useMemo(
    () => allFindings.filter((finding) => !isClosedReviewStatus(reviewStatuses[finding.reportId])),
    [allFindings, reviewStatuses],
  );
  const calendarProperty = useMemo<CalendarProperty>(() => ({
    displayName: seed.property.displayName,
    address: [seed.property.address.line1, seed.property.address.city, seed.property.address.region, seed.property.address.postalCode].filter(Boolean).join(", "),
  }), [seed.property]);

  const selectProperty = (nextPropertyId: string) => {
    document.cookie = `houser_property=${encodeURIComponent(nextPropertyId)}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/?property=${encodeURIComponent(nextPropertyId)}`);
  };

  const recordReviewUpdate = async (reportId: string, status: ReviewStatus, note: string) => {
    const item = allFindings.find((finding) => finding.reportId === reportId);
    if (!item?.workItemId) throw new Error("This work item has not been connected to the database yet.");
    const result = await recordReviewUpdateAction({ workItemId: item.workItemId, reportId, status, note });
    setReviewStatuses((current) => ({ ...current, [reportId]: result.status }));
    setReviewActivities((current) => [result.activity, ...current]);
  };

  const completeWorkItem = async (reportId: string, details: CompletionDetails) => {
    const item = allFindings.find((finding) => finding.reportId === reportId);
    if (!item?.workItemId) throw new Error("This work item has not been connected to the database yet.");
    const result = await completeWorkItemAction({ workItemId: item.workItemId, reportId, ...details });
    setReviewStatuses((current) => ({ ...current, [reportId]: result.status }));
    setReviewActivities((current) => [result.activity, ...current]);
    setServiceRecords((current) => [result.serviceRecord, ...current]);
    return result;
  };

  const changeView = (view: View) => {
    if (view === "work") {
      setWorkIntent((current) => ({ category: "all", severity: "all", selectedReportId: null, revision: current.revision + 1 }));
    }
    setActiveView(view);
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
    contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="grid h-dvh grid-rows-[minmax(0,1fr)_auto] overflow-hidden lg:h-auto lg:min-h-dvh lg:grid-cols-[248px_1fr] lg:grid-rows-none lg:overflow-visible">
      <DesktopSidebar activeView={activeView} workCount={currentFindings.length} userEmail={userEmail} onChangeView={changeView} />
      <div ref={contentScrollRef} className="min-w-0 overflow-y-auto overscroll-y-contain lg:overflow-visible">
        <TopBar selectedPropertyId={selectedPropertyId} properties={properties} userEmail={userEmail} setProperty={selectProperty} canAdd={Boolean(propertyId)} onAdd={() => setIsAdding(true)} onUpload={() => { setUploadTarget(null); setIsUploadingInspection(true); }} />
        <main className="mx-auto w-full max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">
          {activeView === "home" ? (
            <HomeView seed={seed} findings={currentFindings} hasInspectionDocument={hasInspectionDocument} canAdd={Boolean(propertyId)} onOpenWork={openWork} onUpload={() => { setUploadTarget(null); setIsUploadingInspection(true); }} />
          ) : activeView === "work" ? (
            <WorkView key={workIntent.revision} findings={allFindings} calendarProperty={calendarProperty} initialCategory={workIntent.category} initialSeverity={workIntent.severity} initialSelectedReportId={workIntent.selectedReportId} reviewStatuses={reviewStatuses} reviewActivities={reviewActivities} serviceRecords={serviceRecords} onRecordReview={recordReviewUpdate} onCompleteWork={completeWorkItem} onAttachDocument={(item) => { setUploadTarget(item); setIsUploadingInspection(true); }} />
          ) : activeView === "timeline" ? (
            <TimelineView findings={currentFindings} calendarProperty={calendarProperty} reviewStatuses={reviewStatuses} reviewActivities={reviewActivities} serviceRecords={serviceRecords} onRecordReview={recordReviewUpdate} onCompleteWork={completeWorkItem} onAttachDocument={(item) => { setUploadTarget(item); setIsUploadingInspection(true); }} />
          ) : (
            <AssetsView seed={seed} />
          )}
        </main>
      </div>
      <MobileNav activeView={activeView} onChangeView={changeView} canAdd={Boolean(propertyId)} onAdd={() => { if (propertyId) setIsAdding(true); }} />
      {isAdding && propertyId ? (
        <AddWorkDialog
          seed={seed}
          onClose={() => setIsAdding(false)}
          onUpload={() => { setIsAdding(false); setUploadTarget(null); setIsUploadingInspection(true); }}
          onAdd={async (item) => {
            const created = await createManualWorkItemAction({ propertyId, title: item.title, description: item.suggestedAction, category: item.category, area: item.area });
            setLocalItems((items) => [created, ...items]);
            setReviewStatuses((current) => ({ ...current, [created.reportId]: "needs_review" }));
          }}
        />
      ) : null}
      {isUploadingInspection && propertyId ? <DocumentUploadDialog propertyId={propertyId} seed={seed} findings={allFindings} initialWorkItem={uploadTarget} onClose={() => { setIsUploadingInspection(false); setUploadTarget(null); }} /> : null}
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
        <Link href="/household" className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-white/60 hover:bg-white/8 hover:text-white"><Settings className="size-[18px]" /> Household</Link>
        <form action={signOutAction}><button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-white/60 hover:bg-white/8 hover:text-white"><LogOut className="size-[18px]" /> Sign out</button></form>
      </div>
    </aside>
  );
}

function TopBar({ selectedPropertyId, properties, userEmail, setProperty, canAdd, onAdd, onUpload }: { selectedPropertyId: string | "all"; properties: PropertySummary[]; userEmail: string; setProperty: (propertyId: string) => void; canAdd: boolean; onAdd: () => void; onUpload: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/6 bg-[rgba(243,241,235,0.88)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
        <div className="lg:hidden"><div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-[var(--forest-dark)] text-[var(--lime)]"><Home className="size-[18px]" /></div><span className="font-display text-lg font-extrabold tracking-tight">Houser</span></div></div>
        <PropertySelect selectedPropertyId={selectedPropertyId} properties={properties} setProperty={setProperty} className="hidden sm:block" />
        <div className="flex items-center gap-2"><Link href="/chat" className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--forest)]/15 bg-[var(--mint)]/60 px-3 text-sm font-extrabold text-[var(--forest)] sm:px-4"><MessageCircle className="size-[18px]"/><span className="hidden sm:inline">Ask Houser</span><span className="sr-only sm:hidden">Ask Houser</span></Link><Link href="/household" className="grid size-11 place-items-center rounded-xl border border-black/8 bg-white/65 text-[var(--muted)] lg:hidden" aria-label="Household settings"><Settings className="size-[18px]"/></Link><form action={signOutAction} className="lg:hidden"><button type="submit" aria-label={`Sign out ${userEmail}`} className="grid size-11 place-items-center rounded-xl border border-black/8 bg-white/65 text-[var(--muted)]"><LogOut className="size-[18px]" /></button></form>{canAdd ? <><button type="button" onClick={onUpload} className="hidden min-h-11 items-center gap-2 rounded-xl border border-black/8 bg-white/70 px-4 text-sm font-bold text-[var(--forest)] sm:flex"><Upload className="size-[18px]" /> Upload document</button><button type="button" onClick={onAdd} className="hidden min-h-11 items-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-sm font-bold text-white shadow-lg shadow-[#214f3e]/15 transition hover:-translate-y-0.5 hover:bg-[var(--forest-dark)] sm:flex"><Plus className="size-[18px]" /> Add work</button></> : null}</div>
      </div>
      <PropertySelect selectedPropertyId={selectedPropertyId} properties={properties} setProperty={setProperty} className="mt-3 block sm:hidden" full />
    </header>
  );
}

function PropertySelect({ selectedPropertyId, properties, setProperty, className, full = false }: { selectedPropertyId: string | "all"; properties: PropertySummary[]; setProperty: (propertyId: string) => void; className: string; full?: boolean }) {
  return (
    <label className={`relative ${className}`}>
      <span className="sr-only">Selected property</span>
      <select value={selectedPropertyId} onChange={(event) => setProperty(event.target.value)} className={`h-11 appearance-none rounded-xl border border-black/8 bg-white/70 py-0 pl-4 pr-10 text-sm font-bold text-[var(--ink)] shadow-sm ${full ? "w-full" : ""}`}>
        {properties.length > 1 ? <option value="all">All properties</option> : null}
        {properties.map((property) => <option key={property.id} value={property.id}>{property.displayName} · {property.propertyType.replaceAll("_", " ")}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
    </label>
  );
}

function HomeView({ seed, findings, hasInspectionDocument, canAdd, onOpenWork, onUpload }: { seed: InspectionSeed; findings: Finding[]; hasInspectionDocument: boolean; canAdd: boolean; onOpenWork: (intent?: Partial<Omit<WorkIntent, "revision">>) => void; onUpload: () => void }) {
  const counts = countBySeverity(findings);
  const categories = groupByCategory(findings).slice(0, 6);
  const safetyItems = findings.filter((item) => item.severity === "safety_hazard").slice(0, 4);

  return (
    <div>
      <section className="enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]"><CircleDot className="size-3 fill-[var(--lime)]" /> {seed.property.displayName} · {seed.property.kind.replaceAll("_", " ")}</div>
          <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.02] tracking-[-0.055em]">{seed.property.kind === "household" ? "Your homes, at a glance." : "Your house, at a glance."}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{seed.property.kind === "household" ? "Review work across every shared property, then choose one house when you want to add something new." : "Review inspection findings, capture what has changed, and turn the remaining items into a clear plan."}</p>
        </div>
        <button type="button" onClick={() => onOpenWork()} className="group flex min-h-11 items-center gap-2 self-start rounded-xl border border-black/8 bg-white px-4 text-sm font-bold surface-shadow sm:self-auto">View all work <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></button>
      </section>

      <section className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Property summary">
        <SummaryCard label="Needs review" value={findings.length} note="From inspection" icon={ClipboardCheck} tone="forest" />
        <SummaryCard label="Safety items" value={counts.safety_hazard} note="Verify first" icon={ShieldAlert} tone="rose" />
        <SummaryCard label="Maintenance" value={counts.maintenance_item} note="Recurring candidates" icon={Clock3} tone="amber" />
        <SummaryCard label="Tracked assets" value={seed.assets.length} note="From report" icon={HardHat} tone="lime" />
      </section>

      <section className={`mt-4 grid gap-4 ${hasInspectionDocument || !canAdd ? "" : "xl:grid-cols-[1.45fr_0.75fr]"}`}>
        {hasInspectionDocument || !canAdd ? null : <div className="enter enter-delay-1 grain overflow-hidden rounded-[28px] bg-[var(--forest)] text-white surface-shadow">
          <div className="grid min-h-[260px] gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--lime)]"><FileText className="size-4" /> Inspection ready</div>
                <h2 className="font-display mt-4 max-w-lg text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl">Turn the Sample Home report into your working plan.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Every finding keeps its page reference. Review what is still relevant, attach report captures, and record anything already completed.</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => onOpenWork()} className="flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[var(--lime)] px-4 text-sm font-extrabold text-[var(--forest-dark)] transition hover:brightness-105">Start review <ArrowRight className="size-4" /></button><button type="button" onClick={onUpload} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-extrabold text-white hover:bg-white/10"><Upload className="size-4" /> Upload document</button></div>
            </div>
            <ReportIllustration />
          </div>
        </div>}

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

function WorkView({ findings, calendarProperty, initialCategory, initialSeverity, initialSelectedReportId, reviewStatuses, reviewActivities, serviceRecords, onRecordReview, onCompleteWork, onAttachDocument }: { findings: Finding[]; calendarProperty: CalendarProperty; initialCategory: string; initialSeverity: Severity | "all"; initialSelectedReportId: string | null; reviewStatuses: Record<string, ReviewStatus>; reviewActivities: ReviewActivity[]; serviceRecords: ServiceRecord[]; onRecordReview: (reportId: string, status: ReviewStatus, note: string) => Promise<void>; onCompleteWork: (reportId: string, details: CompletionDetails) => Promise<unknown>; onAttachDocument: (item: Finding) => void }) {
  const [scope, setScope] = useState<"current" | "history">("current");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity | "all">(initialSeverity);
  const [category, setCategory] = useState(initialCategory);
  const [selectedItem, setSelectedItem] = useState<Finding | null>(() => findings.find((item) => item.reportId === initialSelectedReportId) ?? null);
  const [requestedStatus, setRequestedStatus] = useState<ReviewStatus | null>(null);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const currentCount = useMemo(() => findings.filter((item) => !isClosedReviewStatus(reviewStatuses[item.reportId])).length, [findings, reviewStatuses]);
  const historyCount = findings.length - currentCount;
  const scopedFindings = useMemo(
    () => findings.filter((item) => scope === "history" ? isClosedReviewStatus(reviewStatuses[item.reportId]) : !isClosedReviewStatus(reviewStatuses[item.reportId])),
    [findings, reviewStatuses, scope],
  );
  const categories = useMemo(() => [...new Set(scopedFindings.map((item) => item.category))].sort(), [scopedFindings]);
  const filtered = useMemo(() => filterFindings(scopedFindings, { query, severity, category }), [scopedFindings, query, severity, category]);

  const changeScope = (nextScope: "current" | "history") => {
    setScope(nextScope);
    setCategory("all");
    setSeverity("all");
    setMenuItemId(null);
  };

  return (
    <>
    <div className="enter">
      <PageHeading eyebrow={scope === "current" ? "Inspection inbox" : "Work history"} title={scope === "current" ? "Work to review" : "Completed and dismissed"} description={scope === "current" ? "Confirm what is still relevant before these findings become active work." : "Closed items stay available here for service history and future reference."} />
      <div className="mt-6 inline-flex w-full rounded-2xl border border-black/8 bg-white/55 p-1 sm:w-auto" aria-label="Work status view">
        <button type="button" aria-pressed={scope === "current"} onClick={() => changeScope("current")} className={`min-h-11 flex-1 rounded-xl px-4 text-xs font-extrabold transition sm:flex-none ${scope === "current" ? "bg-[var(--forest)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-white"}`}>Current <span className="ml-1 opacity-70">{currentCount}</span></button>
        <button type="button" aria-pressed={scope === "history"} onClick={() => changeScope("history")} className={`min-h-11 flex-1 rounded-xl px-4 text-xs font-extrabold transition sm:flex-none ${scope === "history" ? "bg-[var(--forest)] text-white shadow-sm" : "text-[var(--muted)] hover:bg-white"}`}>History <span className="ml-1 opacity-70">{historyCount}</span></button>
      </div>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1"><span className="sr-only">Search work</span><Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[var(--muted)]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work, areas, or actions" className="h-12 w-full rounded-2xl border border-black/8 bg-[var(--paper)] pl-11 pr-4 text-sm outline-none surface-shadow" /></label>
        <label className="relative"><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-12 w-full appearance-none rounded-2xl border border-black/8 bg-[var(--paper)] pl-4 pr-10 text-sm font-bold lg:w-56"><option value="all">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/></label>
      </div>
      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Severity filters">{(["all", "safety_hazard", "recommendation", "maintenance_item"] as const).map((value) => <button key={value} type="button" onClick={() => setSeverity(value)} className={`min-h-10 shrink-0 rounded-xl px-4 text-xs font-extrabold ${severity === value ? "bg-[var(--forest)] text-white" : "border border-black/7 bg-white/60 text-[var(--muted)]"}`}>{value === "all" ? `All ${scopedFindings.length}` : severityLabels[value]}</button>)}</div>
      <div className="mt-5 flex items-center justify-between"><p className="text-xs font-bold text-[var(--muted)]">Showing {filtered.length} items</p><span className="text-xs font-bold text-[var(--muted)]">Newest source first</span></div>
      <div className="mt-2 grid gap-3 xl:grid-cols-2">{filtered.map((item) => <FindingCard key={item.workItemId ?? item.reportId} item={item} status={reviewStatuses[item.reportId] ?? "needs_review"} menuOpen={menuItemId === item.reportId} onOpen={() => { setMenuItemId(null); setRequestedStatus(null); setSelectedItem(item); }} onToggleMenu={() => setMenuItemId((current) => current === item.reportId ? null : item.reportId)} onSetStatus={(status) => { setMenuItemId(null); setRequestedStatus(status); setSelectedItem(item); }} />)}</div>
      {filtered.length === 0 ? <div className="mt-8 rounded-[24px] border border-dashed border-black/15 p-10 text-center"><Search className="mx-auto size-7 text-[var(--muted)]"/><h2 className="font-display mt-3 text-lg font-extrabold">{scope === "history" && historyCount === 0 ? "No closed work yet" : "No matching work"}</h2><p className="mt-1 text-sm text-[var(--muted)]">{scope === "history" && historyCount === 0 ? "Completed and dismissed items will appear here." : "Try another search or clear a filter."}</p></div> : null}
    </div>
    {selectedItem ? <FindingReviewDialog key={`${selectedItem.reportId}-${requestedStatus ?? "details"}`} item={selectedItem} findings={findings} calendarProperty={calendarProperty} status={reviewStatuses[selectedItem.reportId] ?? "needs_review"} activities={reviewActivities.filter((activity) => activity.reportId === selectedItem.reportId)} serviceRecords={serviceRecords.filter((record) => record.reportId === selectedItem.reportId)} initialStatus={requestedStatus} onClose={() => { setSelectedItem(null); setRequestedStatus(null); }} onOpenRelated={(workItemId) => { const relatedItem = findings.find((finding) => finding.workItemId === workItemId); if (relatedItem) { setRequestedStatus(null); setSelectedItem(relatedItem); } }} onRecordReview={(status, note) => onRecordReview(selectedItem.reportId, status, note)} onCompleteWork={(details) => onCompleteWork(selectedItem.reportId, details)} onAttachDocument={() => onAttachDocument(selectedItem)} /> : null}
    </>
  );
}

function FindingCard({ item, status, menuOpen, onOpen, onToggleMenu, onSetStatus }: { item: Finding; status: ReviewStatus; menuOpen: boolean; onOpen: () => void; onToggleMenu: () => void; onSetStatus: (status: ReviewStatus) => void }) {
  const tone = item.severity === "safety_hazard" ? "bg-[#f8ddd7] text-[#96382d]" : item.severity === "maintenance_item" ? "bg-[#f9e6c8] text-[#84581b]" : "bg-[var(--mint)] text-[var(--forest)]";
  return <article className="group relative rounded-[22px] border border-black/6 bg-[var(--paper)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--forest)]/20 surface-shadow"><div className="flex items-start gap-3"><div className={`grid size-10 shrink-0 place-items-center rounded-[14px] ${tone}`}>{item.severity === "safety_hazard" ? <AlertTriangle className="size-[18px]"/> : item.severity === "maintenance_item" ? <Clock3 className="size-[18px]"/> : <ClipboardCheck className="size-[18px]"/>}</div><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap gap-2"><span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">{item.sourceReference ?? item.reportId} · {item.category}</span>{item.propertyName ? <span className="rounded-full bg-black/5 px-2 text-[9px] font-extrabold">{item.propertyName}</span> : null}{"isLocal" in item ? <span className="rounded-full bg-[var(--lime)] px-2 text-[9px] font-extrabold uppercase">New</span> : null}</div><h2 className="mt-1 text-[15px] font-extrabold leading-5 group-hover:text-[var(--forest)]">{item.title}</h2></button><div className="relative"><button type="button" onClick={onToggleMenu} aria-label={`More options for ${item.title}`} aria-expanded={menuOpen} className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5"><MoreHorizontal className="size-5"/></button>{menuOpen ? <FindingMenu onOpen={onOpen} onSetStatus={onSetStatus} /> : null}</div></div><button type="button" onClick={onOpen} className="block w-full text-left"><p className="mt-4 text-sm leading-6 text-[var(--muted)]">{item.suggestedAction}</p><div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${tone}`}>{severityLabels[item.severity]}</span><span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-extrabold text-[var(--muted)]">{item.area}</span><ReviewStatusPill status={status} /></div></button><div className="mt-4 flex items-center justify-between border-t border-black/6 pt-3"><button type="button" onClick={onOpen} className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--forest)]"><ImageIcon className="size-3.5"/> {item.sourcePages.length ? formatSourcePages(item.sourcePages) : "Manual entry"}</button><button type="button" onClick={onOpen} className="min-h-9 rounded-lg px-2 text-xs font-extrabold text-[var(--forest)] hover:bg-[var(--mint)]">Review item</button></div></article>;
}

function FindingMenu({ onOpen, onSetStatus }: { onOpen: () => void; onSetStatus: (status: ReviewStatus) => void }) {
  return <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-black/8 bg-white p-1.5 shadow-xl" role="menu"><button type="button" onClick={onOpen} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold hover:bg-black/5" role="menuitem">Open details</button><button type="button" onClick={() => onSetStatus("completed")} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold hover:bg-black/5" role="menuitem">Mark completed</button><button type="button" onClick={() => onSetStatus("deferred")} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold hover:bg-black/5" role="menuitem">Defer for later</button><button type="button" onClick={() => onSetStatus("not_applicable")} className="min-h-10 w-full rounded-xl px-3 text-left text-xs font-extrabold text-[var(--muted)] hover:bg-black/5" role="menuitem">Not applicable</button></div>;
}

function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  const style = status === "completed" ? "bg-[#dcefdc] text-[#246235]" : status === "open" ? "bg-[#e6efe9] text-[var(--forest)]" : status === "deferred" ? "bg-[#eee9dc] text-[#6f6041]" : status === "not_applicable" ? "bg-black/5 text-[var(--muted)]" : "bg-white text-[var(--muted)] ring-1 ring-black/8";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${style}`}>{reviewStatusLabels[status]}</span>;
}

function FindingReviewDialog({ item, findings, calendarProperty, status, activities, serviceRecords, initialStatus, onClose, onOpenRelated, onRecordReview, onCompleteWork, onAttachDocument }: { item: Finding; findings: Finding[]; calendarProperty: CalendarProperty; status: ReviewStatus; activities: ReviewActivity[]; serviceRecords: ServiceRecord[]; initialStatus: ReviewStatus | null; onClose: () => void; onOpenRelated: (workItemId: string) => void; onRecordReview: (status: ReviewStatus, note: string) => Promise<void>; onCompleteWork: (details: CompletionDetails) => Promise<unknown>; onAttachDocument: () => void }) {
  const [pendingStatus, setPendingStatus] = useState<ReviewStatus | null>(initialStatus);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const updateFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingStatus) return;
    const frame = window.requestAnimationFrame(() => {
      updateFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingStatus]);

  const chooseStatus = (nextStatus: ReviewStatus) => {
    setSaveError("");
    setPendingStatus(nextStatus);
  };

  const saveUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingStatus) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const savedStatus = pendingStatus;
      await onRecordReview(savedStatus, note);
      setPendingStatus(null);
      setNote("");
      if (savedStatus === "not_applicable") onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The update could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveCompletion = async (details: CompletionDetails) => {
    setIsSaving(true);
    setSaveError("");
    try {
      await onCompleteWork(details);
      setPendingStatus(null);
      setNote("");
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The completion could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid items-end bg-[#0d1e17]/45 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="finding-review-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--paper)] shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-2xl sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-black/6 bg-[rgba(252,251,248,0.94)] p-5 backdrop-blur-xl sm:p-7">
          <div className="pr-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--forest)]">{item.sourceReference ?? item.reportId} · {item.category}{item.propertyName ? ` · ${item.propertyName}` : ""}</p>
            <h2 id="finding-review-title" className="font-display mt-2 text-2xl font-extrabold leading-tight tracking-[-0.04em]">{item.title}</h2>
            <div className="mt-3"><ReviewStatusPill status={status} /></div>
          </div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/5 hover:bg-black/10" aria-label="Close review"><X className="size-5"/></button>
        </div>
        <div className="space-y-6 p-5 sm:p-7">
          <section><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Inspector recommendation</p><p className="mt-2 text-sm leading-6">{item.suggestedAction}</p></section>
          <dl className="grid grid-cols-2 gap-3"><Detail label="Area" value={item.area} /><Detail label="Location" value={item.location} icon={MapPin} /><Detail label="Priority" value={item.priority} /><Detail label="Work type" value={item.workType} /></dl>
          {item.targetStartOn ? <CalendarActions item={item} property={calendarProperty} /> : null}
          <InspectionEvidenceCard item={item} />
          <LinkedWorkDocuments workItemId={item.workItemId} onAddDocument={onAttachDocument} />
          <RelatedWorkCard item={item} findings={findings} onOpenItem={onOpenRelated} />
          <section>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Owner review</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Confirm the current condition before turning this historical inspection finding into active work.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" aria-pressed={pendingStatus === "open"} onClick={() => chooseStatus("open")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold ${pendingStatus === "open" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}><ClipboardCheck className="size-[18px]"/> Still needs work</button><button type="button" aria-pressed={pendingStatus === "completed"} onClick={() => chooseStatus("completed")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold ${pendingStatus === "completed" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}><CheckCircle2 className="size-[18px]"/> Already completed</button><button type="button" aria-pressed={pendingStatus === "deferred"} onClick={() => chooseStatus("deferred")} className={`min-h-11 rounded-xl px-4 text-xs font-extrabold ${pendingStatus === "deferred" ? "bg-[var(--forest)] text-white" : "border border-black/8"}`}>Defer for later</button><button type="button" aria-pressed={pendingStatus === "not_applicable"} onClick={() => chooseStatus("not_applicable")} className={`min-h-11 rounded-xl px-4 text-xs font-extrabold ${pendingStatus === "not_applicable" ? "bg-[var(--forest)] text-white" : "text-[var(--muted)] hover:bg-black/5"}`}>Not applicable</button></div>
            {pendingStatus ? <div ref={updateFormRef} className="scroll-mt-28">{pendingStatus === "completed" ? <CompletionForm isSaving={isSaving} error={saveError} onCancel={() => { setPendingStatus(null); setSaveError(""); }} onSubmit={saveCompletion} /> : <StatusUpdateForm status={pendingStatus} note={note} isSaving={isSaving} error={saveError} onNoteChange={setNote} onCancel={() => { setPendingStatus(null); setNote(""); setSaveError(""); }} onSubmit={saveUpdate} />}</div> : null}
            <p className="mt-3 text-center text-[10px] font-bold text-[var(--muted)]">Synced privately · changes appear for every household member.</p>
          </section>
          <ServiceHistory records={serviceRecords} />
          <ActivityHistory activities={activities} />
        </div>
      </section>
    </div>
  );
}

/* Signed private previews expire quickly, so browser-native images avoid an image optimizer caching private URLs. */
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
        .then(setEvidence)
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Evidence could not be loaded."));
    });
  };

  useEffect(() => {
    if (!item.workItemId || item.sourcePages.length === 0) return;
    const workItemId = item.workItemId;
    startTransition(() => {
      void getInspectionEvidenceAction({ workItemId })
        .then(setEvidence)
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Evidence could not be loaded."));
    });
  }, [item.sourcePages.length, item.workItemId]);

  const activePage = evidence?.pages.find((page) => page.pageNumber === selectedPage) ?? evidence?.pages[0];

  return <section className="rounded-[22px] border border-black/7 bg-white/65 p-4">
    <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--forest)]"><ImageIcon className="size-[18px]"/></div><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">Inspection evidence</p><p className="mt-1 text-sm font-bold text-[var(--forest)]">{item.sourcePages.length ? formatSourcePages(item.sourcePages) : "Manual entry"}</p></div></div>
    {item.sourcePages.length === 0 ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">This manually added item does not have an inspection source.</p>
      : isPending ? <div className="mt-4 space-y-3" aria-live="polite"><div className="aspect-[8.5/11] animate-pulse rounded-2xl bg-black/6"/><p className="text-xs font-bold text-[var(--muted)]">Loading private report evidence…</p></div>
      : loadError ? <div className="mt-4 rounded-2xl bg-[#f8ddd7] p-4"><p role="alert" className="text-xs font-bold text-[#8c3328]">{loadError}</p><button type="button" onClick={loadEvidence} className="mt-3 min-h-10 rounded-xl bg-white px-4 text-xs font-extrabold">Try again</button></div>
      : activePage ? <div className="mt-4">
        <a href={activePage.reportUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-2xl border border-black/8 bg-[#efede7]" aria-label={`Open inspection report at page ${activePage.pageNumber}`}>
          {activePage.previewUrl ? <div className="relative aspect-[8.5/11] overflow-hidden"><img src={activePage.previewUrl} alt={`Inspection report page ${activePage.pageNumber}`} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.01]" loading="lazy"/><div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-xl bg-[rgba(13,30,23,0.88)] px-3 py-2 text-xs font-extrabold text-white backdrop-blur"><span>Page {activePage.pageNumber}</span><span className="flex items-center gap-1.5">Open report <ExternalLink className="size-3.5"/></span></div></div>
            : <div className="flex min-h-24 items-center justify-between gap-4 p-4"><div><p className="text-xs font-extrabold text-[var(--forest)]">Open original inspection</p><p className="mt-1 text-sm font-bold">Page {activePage.pageNumber}</p></div><ExternalLink className="size-5 text-[var(--forest)]"/></div>}
        </a>
        {evidence && evidence.pages.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Inspection evidence pages">{evidence.pages.map((page) => <button key={page.pageNumber} type="button" onClick={() => setSelectedPage(page.pageNumber)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-extrabold ${activePage.pageNumber === page.pageNumber ? "bg-[var(--forest)] text-white" : "border border-black/8 bg-white"}`}>Page {page.pageNumber}</button>)}</div> : null}
        {item.sourceExcerpt ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">“{item.sourceExcerpt}”</p> : null}
        <p className="mt-3 truncate text-[10px] font-bold text-[var(--muted)]">{evidence?.documentName} · private links expire in 5 minutes</p>
      </div>
      : <div className="mt-4 rounded-2xl border border-dashed border-black/10 p-4"><p className="text-xs leading-5 text-[var(--muted)]">The page reference is preserved, but this report has not been connected to private storage yet.</p></div>}
  </section>;
}
/* eslint-enable @next/next/no-img-element */

function LinkedWorkDocuments({ workItemId, onAddDocument }: { workItemId?: string; onAddDocument: () => void }) {
  const [documents, setDocuments] = useState<LinkedWorkDocument[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!workItemId) return;
    startTransition(() => {
      void getLinkedWorkDocumentsAction({ workItemId })
        .then(setDocuments)
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Linked documents could not be loaded."));
    });
  }, [workItemId]);

  if (!workItemId) return null;
  return <section className="rounded-[22px] border border-black/7 bg-white/65 p-4">
    <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-[var(--forest)]"/><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Attachments</p><p className="mt-0.5 text-xs font-bold">{documents.length} {documents.length === 1 ? "attachment" : "attachments"}</p></div></div><button type="button" onClick={onAddDocument} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--forest)]/15 bg-[var(--mint)]/45 px-3 text-xs font-extrabold text-[var(--forest)]"><Plus className="size-3.5"/> Add file</button></div>
    {isPending ? <p className="mt-3 text-xs font-bold text-[var(--muted)]">Loading attachments…</p> : loadError ? <p role="alert" className="mt-3 text-xs font-bold text-[#8c3328]">{loadError}</p> : documents.length ? <div className="mt-3 space-y-2">{documents.map((document) => <a key={document.id} href={`/api/documents/${document.id}/view`} target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-black/7 bg-white px-3 py-2.5 transition hover:border-[var(--forest)]/25 hover:bg-[var(--mint)]/20" aria-label={`Open original ${document.documentType}: ${document.filename}`}><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/[0.035]">{document.documentType === "photo" ? <ImageIcon className="size-4 text-[var(--forest)]"/> : <FileText className="size-4 text-[var(--forest)]"/>}</div><div className="min-w-0"><p className="truncate text-xs font-extrabold">{document.filename}</p><p className="mt-1 text-[10px] capitalize text-[var(--muted)]">{document.documentType}{document.documentDate ? ` · ${formatDateOnly(document.documentDate)}` : ""}</p></div></div><span className="flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-[var(--forest)]">Open original <ExternalLink className="size-3.5"/></span></a>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-black/10 px-3 py-4 text-xs leading-5 text-[var(--muted)]">No photos, quotes, invoices, or receipts attached yet. The inspection remains available in the evidence preview above.</p>}
  </section>;
}

function RelatedWorkCard({ item, findings, onOpenItem }: { item: Finding; findings: Finding[]; onOpenItem: (workItemId: string) => void }) {
  const [group, setGroup] = useState<RelatedWorkGroup | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState("Related work");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const workItemId = item.workItemId;

  useEffect(() => {
    if (!workItemId) return;
    const controller = new AbortController();
    void fetch(`/api/work-items/${workItemId}/related`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Related work could not be loaded.");
        return result as RelatedWorkGroup;
      })
      .then((result) => {
        setGroup(result);
        setLabel(result.group?.label ?? "Related work");
        setSelectedIds(result.relatedItems.map((relatedItem) => relatedItem.id));
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Related work could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [workItemId]);

  const candidates = useMemo(() => {
    const search = query.trim().toLowerCase();
    return findings
      .filter((finding) => finding.workItemId && finding.workItemId !== workItemId)
      .filter((finding) => !search || [finding.title, finding.reportId, finding.category, finding.area, finding.location].some((value) => value.toLowerCase().includes(search)))
      .sort((a, b) => Number(selectedIds.includes(b.workItemId!)) - Number(selectedIds.includes(a.workItemId!)) || a.title.localeCompare(b.title))
      .slice(0, 12);
  }, [findings, query, selectedIds, workItemId]);

  if (!workItemId) return null;

  const toggleCandidate = (candidateId: string) => {
    const existingIds = new Set(group?.relatedItems.map((relatedItem) => relatedItem.id) ?? []);
    if (existingIds.has(candidateId)) return;
    setSelectedIds((current) => current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]);
  };

  const save = async () => {
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/work-items/${workItemId}/related`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, workItemIds: selectedIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Related work could not be saved.");
      const savedGroup = result as RelatedWorkGroup;
      setGroup(savedGroup);
      setLabel(savedGroup.group?.label ?? label);
      setSelectedIds(savedGroup.relatedItems.map((relatedItem) => relatedItem.id));
      setQuery("");
      setIsEditing(false);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Related work could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="rounded-[22px] border border-black/7 bg-white/65 p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2"><Link2 className="size-4 shrink-0 text-[var(--forest)]"/><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Related work</p><p className="mt-0.5 truncate text-xs font-bold">{group?.group?.label ?? "Coordinate work that belongs together"}</p></div></div>
      <button type="button" onClick={() => setIsEditing((current) => !current)} className="min-h-10 shrink-0 rounded-xl border border-[var(--forest)]/15 bg-[var(--mint)]/45 px-3 text-xs font-extrabold text-[var(--forest)]">{isEditing ? "Cancel" : group?.group ? "Add work" : "Link work"}</button>
    </div>
    {isLoading ? <p className="mt-3 text-xs font-bold text-[var(--muted)]">Loading related work…</p> : group?.relatedItems.length ? <div className="mt-3 space-y-2">{group.relatedItems.map((relatedItem) => { const localItem = findings.find((finding) => finding.workItemId === relatedItem.id); return <button key={relatedItem.id} type="button" onClick={() => onOpenItem(relatedItem.id)} className="group/related flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-black/7 bg-white px-3 py-2.5 text-left transition hover:border-[var(--forest)]/25 hover:bg-[var(--mint)]/20"><div className="min-w-0"><p className="truncate text-xs font-extrabold">{relatedItem.title}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{localItem?.reportId ?? relatedItem.sourceSection ?? "Work item"}{localItem?.category || relatedItem.category ? ` · ${localItem?.category ?? relatedItem.category}` : ""}</p></div><ArrowRight className="size-4 shrink-0 text-[var(--forest)] transition group-hover/related:translate-x-0.5"/></button>; })}</div> : !isEditing && !error ? <p className="mt-3 rounded-xl border border-dashed border-black/10 px-3 py-4 text-xs leading-5 text-[var(--muted)]">Link jobs you want a contractor to review during the same visit. Every linked item will point back to the others.</p> : null}
    {isEditing ? <div className="mt-4 rounded-2xl bg-[var(--mint)]/35 p-3">
      <label className="block"><span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">Group name</span><input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Mason visit" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"/></label>
      <label className="relative mt-3 block"><span className="sr-only">Search work to link</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work to link" className="h-11 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm"/></label>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto" aria-label="Work items available to link">{candidates.map((candidate) => { const candidateId = candidate.workItemId!; const isExisting = group?.relatedItems.some((relatedItem) => relatedItem.id === candidateId) ?? false; const isSelected = selectedIds.includes(candidateId); return <label key={candidateId} className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${isSelected ? "bg-white" : "hover:bg-white/70"}`}><input type="checkbox" checked={isSelected} disabled={isExisting} onChange={() => toggleCandidate(candidateId)} className="mt-0.5 size-4 accent-[var(--forest)]"/><span className="min-w-0"><span className="block truncate text-xs font-extrabold">{candidate.title}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{candidate.reportId} · {candidate.category} · {candidate.area}{isExisting ? " · already linked" : ""}</span></span></label>; })}</div>
      {candidates.length === 0 ? <p className="mt-3 text-xs text-[var(--muted)]">No matching work items.</p> : null}
      <div className="mt-3 flex justify-end"><button type="button" onClick={save} disabled={isSaving || !label.trim() || selectedIds.length === 0} className="min-h-10 rounded-xl bg-[var(--forest)] px-4 text-xs font-extrabold text-white disabled:opacity-40">{isSaving ? "Saving…" : "Save related work"}</button></div>
    </div> : null}
    {error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}
  </section>;
}

function StatusUpdateForm({ status, note, isSaving, error, onNoteChange, onCancel, onSubmit }: { status: ReviewStatus; note: string; isSaving: boolean; error: string; onNoteChange: (note: string) => void; onCancel: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const prompts: Partial<Record<ReviewStatus, string>> = {
    open: "What did you observe?",
    completed: "What was done?",
    deferred: "Why was this deferred, and when should it be reconsidered?",
    not_applicable: "Why doesn't this apply?",
  };
  return <form onSubmit={onSubmit} className="mt-4 rounded-[20px] border border-[var(--forest)]/15 bg-[var(--mint)]/55 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--forest)]">Update status</p><p className="mt-1 text-sm font-extrabold">{reviewStatusLabels[status]}</p></div><ReviewStatusPill status={status} /></div><label className="mt-4 block"><span className="text-xs font-extrabold">{prompts[status] ?? "Add a note"} <span className="font-medium text-[var(--muted)]">(optional)</span></span><textarea autoFocus value={note} onChange={(event) => onNoteChange(event.target.value)} rows={4} placeholder="Add details that will help you understand this update later…" className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm leading-5 outline-none focus:border-[var(--forest)]/40" /></label>{error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}<div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={isSaving} onClick={onCancel} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] hover:bg-black/5 disabled:opacity-50">Cancel</button><button type="submit" disabled={isSaving} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white disabled:opacity-60">{isSaving ? "Saving…" : "Save update"}</button></div></form>;
}

function CompletionForm({ isSaving, error, onCancel, onSubmit }: { isSaving: boolean; error: string; onCancel: () => void; onSubmit: (details: CompletionDetails) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [performedOn, setPerformedOn] = useState(today);
  const [vendorName, setVendorName] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [warrantyEndsOn, setWarrantyEndsOn] = useState("");
  const [recurrence, setRecurrence] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({
      performedOn,
      vendorName,
      cost,
      note,
      warrantyEndsOn,
      recurrenceMonths: recurrence ? Number(recurrence) : null,
    });
  };

  const fieldClass = "mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[var(--forest)]/40";
  return (
    <form onSubmit={submit} className="mt-4 rounded-[20px] border border-[var(--forest)]/15 bg-[var(--mint)]/55 p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--forest)]">Record completed work</p><p className="mt-1 text-sm font-extrabold">Create a permanent service record</p></div><ReviewStatusPill status="completed" /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span className="text-xs font-extrabold">Completion date</span><input required type="date" max={today} value={performedOn} onChange={(event) => setPerformedOn(event.target.value)} className={fieldClass} /></label>
        <label><span className="text-xs font-extrabold">Vendor <span className="font-medium text-[var(--muted)]">(optional)</span></span><input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Company or person" className={fieldClass} /></label>
        <label><span className="text-xs font-extrabold">Actual cost <span className="font-medium text-[var(--muted)]">(optional)</span></span><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 mt-1 -translate-y-1/2 text-sm text-[var(--muted)]">$</span><input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0.00" className={`${fieldClass} pl-7`} /></div></label>
        <label><span className="text-xs font-extrabold">Warranty ends <span className="font-medium text-[var(--muted)]">(optional)</span></span><input type="date" min={performedOn} value={warrantyEndsOn} onChange={(event) => setWarrantyEndsOn(event.target.value)} className={fieldClass} /></label>
      </div>
      <label className="mt-3 block"><span className="text-xs font-extrabold">What was done? <span className="font-medium text-[var(--muted)]">(optional)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Repairs, parts, observations, and anything useful for next time…" className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm leading-5 outline-none focus:border-[var(--forest)]/40" /></label>
      <label className="mt-3 block"><span className="text-xs font-extrabold">Schedule this again?</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className={fieldClass}><option value="">No recurring follow-up</option><option value="3">In 3 months</option><option value="6">In 6 months</option><option value="12">In 1 year</option><option value="24">In 2 years</option><option value="60">In 5 years</option></select></label>
      {recurrence ? <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-[var(--muted)]">Houser will close this item and create the next scheduled occurrence from the completion date.</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={isSaving} onClick={onCancel} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] hover:bg-black/5 disabled:opacity-50">Cancel</button><button type="submit" disabled={isSaving || !performedOn} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white disabled:opacity-60">{isSaving ? "Saving service…" : "Complete & save service"}</button></div>
    </form>
  );
}

function ServiceHistory({ records }: { records: ServiceRecord[] }) {
  if (!records.length) return null;
  return <section><div className="flex items-center gap-2"><FileText className="size-4 text-[var(--forest)]"/><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Service history</p></div><ol className="mt-3 space-y-3">{records.map((record) => <li key={record.id} className="rounded-[18px] border border-black/6 bg-white/65 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-extrabold">{formatDateOnly(record.performedOn)}</p>{record.costMinor === null ? null : <span className="text-sm font-extrabold text-[var(--forest)]">{formatMoney(record.costMinor, record.currency)}</span>}</div><p className="mt-2 text-sm leading-6">{record.description}</p>{record.vendorName ? <p className="mt-1 text-xs font-bold text-[var(--muted)]">Vendor: {record.vendorName}</p> : null}{record.warrantyEndsOn ? <p className="mt-1 text-xs text-[var(--muted)]">Warranty through {formatDateOnly(record.warrantyEndsOn)}</p> : null}{record.nextServiceOn ? <p className="mt-3 rounded-xl bg-[var(--mint)] px-3 py-2 text-xs font-extrabold text-[var(--forest)]">Next service scheduled for {formatDateOnly(record.nextServiceOn)}</p> : null}</li>)}</ol></section>;
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function ActivityHistory({ activities }: { activities: ReviewActivity[] }) {
  return <section><div className="flex items-center gap-2"><MessageSquareText className="size-4 text-[var(--forest)]"/><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Activity history</p></div>{activities.length ? <ol className="mt-3 space-y-3">{activities.map((activity) => <li key={activity.id} className="rounded-[18px] border border-black/6 bg-white/65 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><ReviewStatusPill status={activity.status} /><time className="text-[10px] font-bold text-[var(--muted)]" dateTime={activity.createdAt}>{formatActivityDate(activity.createdAt)}</time></div>{activity.note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{activity.note}</p> : <p className="mt-3 text-xs italic text-[var(--muted)]">Status updated without a note.</p>}<p className="mt-2 text-[10px] font-bold text-[var(--muted)]">Updated by {activity.actorName ?? activity.actorEmail ?? "a household member"}</p></li>)}</ol> : <div className="mt-3 rounded-[18px] border border-dashed border-black/10 p-4 text-sm text-[var(--muted)]">No updates recorded yet.</div>}</section>;
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return <div className="rounded-2xl bg-black/[0.035] p-3"><dt className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">{Icon ? <Icon className="size-3"/> : null}{label}</dt><dd className="mt-1 break-words text-xs font-bold capitalize">{value.replaceAll("_", " ")}</dd></div>;
}

function CalendarActions({ item, property }: { item: Finding; property: CalendarProperty }) {
  if (!item.targetStartOn) return null;

  const openGoogleCalendar = () => {
    window.open(buildGoogleCalendarUrl(item, property, window.location.origin), "_blank", "noopener,noreferrer");
  };

  const downloadIcs = () => {
    const objectUrl = URL.createObjectURL(new Blob([buildIcsCalendar(item, property, window.location.origin)], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = calendarFilename(item);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  return <section className="rounded-[22px] border border-[var(--forest)]/15 bg-[var(--mint)]/45 p-4"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--forest)]"><CalendarClock className="size-[18px]"/></div><div><p className="text-xs font-extrabold">Scheduled for {formatTargetWindow(item)}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Add this all-day reminder to Google Calendar or download a file for another calendar app.</p></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={openGoogleCalendar} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--forest)] px-4 text-xs font-extrabold text-white">Google Calendar <ExternalLink className="size-3.5"/></button><button type="button" onClick={downloadIcs} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-xs font-extrabold text-[var(--forest)]"><Download className="size-3.5"/> Download .ics</button></div></section>;
}

function formatTargetWindow(item: Finding) {
  if (!item.targetStartOn) return "Unscheduled";
  const start = formatDateOnly(item.targetStartOn);
  if (!item.targetEndOn || item.targetEndOn === item.targetStartOn) return start;
  return `${start} – ${formatDateOnly(item.targetEndOn)}`;
}

function TimelineView({ findings, calendarProperty, reviewStatuses, reviewActivities, serviceRecords, onRecordReview, onCompleteWork, onAttachDocument }: { findings: Finding[]; calendarProperty: CalendarProperty; reviewStatuses: Record<string, ReviewStatus>; reviewActivities: ReviewActivity[]; serviceRecords: ServiceRecord[]; onRecordReview: (reportId: string, status: ReviewStatus, note: string) => Promise<void>; onCompleteWork: (reportId: string, details: CompletionDetails) => Promise<unknown>; onAttachDocument: (item: Finding) => void }) {
  const [selectedItem, setSelectedItem] = useState<Finding | null>(null);
  const scheduled = findings.filter((item) => item.targetStartOn).sort((a, b) => (a.targetStartOn ?? "").localeCompare(b.targetStartOn ?? ""));
  const unscheduled = findings.filter((item) => !item.targetStartOn);
  const safety = unscheduled.filter((item) => item.severity === "safety_hazard");
  const important = unscheduled.filter((item) => item.priority === "important" && item.severity !== "safety_hazard");
  const routine = unscheduled.filter((item) => item.priority === "routine" || item.priority === "informational");
  return <><div className="enter"><PageHeading eyebrow="Plan by time" title="Maintenance timeline" description={scheduled.length ? "Scheduled work appears first. Open any scheduled item to add it to Google Calendar or download an .ics reminder." : "The initial report has no trusted due dates yet, so work is grouped by recommended review horizon."} /><div className="mt-8 max-w-4xl space-y-8">{scheduled.length ? <TimelineGroup label="Scheduled" note="Ready to add to your calendar" color="forest" items={scheduled} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /> : null}<TimelineGroup label="Verify first" note="Safety findings · review now" color="rose" items={safety} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /><TimelineGroup label="Plan next" note="Important recommendations · schedule after review" color="amber" items={important.slice(0, 8)} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /><TimelineGroup label="Routine & long-term" note="Maintenance, monitoring, and cosmetic work" color="forest" items={routine.slice(0, 8)} reviewStatuses={reviewStatuses} onOpen={setSelectedItem} /></div></div>{selectedItem ? <FindingReviewDialog key={selectedItem.workItemId ?? selectedItem.reportId} item={selectedItem} findings={findings} calendarProperty={calendarProperty} status={reviewStatuses[selectedItem.reportId] ?? "needs_review"} activities={reviewActivities.filter((activity) => activity.reportId === selectedItem.reportId)} serviceRecords={serviceRecords.filter((record) => record.reportId === selectedItem.reportId)} initialStatus={null} onClose={() => setSelectedItem(null)} onOpenRelated={(workItemId) => { const relatedItem = findings.find((finding) => finding.workItemId === workItemId); if (relatedItem) setSelectedItem(relatedItem); }} onRecordReview={(status, note) => onRecordReview(selectedItem.reportId, status, note)} onCompleteWork={(details) => onCompleteWork(selectedItem.reportId, details)} onAttachDocument={() => onAttachDocument(selectedItem)} /> : null}</>;
}

function TimelineGroup({ label, note, color, items, reviewStatuses, onOpen }: { label: string; note: string; color: "rose" | "amber" | "forest"; items: Finding[]; reviewStatuses: Record<string, ReviewStatus>; onOpen: (item: Finding) => void }) {
  const colors = { rose: "bg-[var(--rose)]", amber: "bg-[var(--amber)]", forest: "bg-[var(--forest)]" };
  return <section className="grid gap-4 sm:grid-cols-[150px_1fr]"><div><div className="flex items-center gap-2"><div className={`size-2.5 rounded-full ${colors[color]}`}/><h2 className="font-display text-base font-extrabold">{label}</h2></div><p className="ml-[18px] mt-1 text-xs leading-5 text-[var(--muted)]">{note}</p></div><div className="relative space-y-3 before:absolute before:-left-[22px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-black/10">{items.map((item) => <button type="button" key={item.reportId} onClick={() => onOpen(item)} className="group block w-full rounded-[20px] border border-black/6 bg-[var(--paper)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--forest)]/20 surface-shadow"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--muted)]">{item.category} · {item.sourceReference ?? item.reportId}{item.propertyName ? ` · ${item.propertyName}` : ""}</div><h3 className="mt-1 text-sm font-extrabold group-hover:text-[var(--forest)]">{item.title}</h3><p className="mt-1 text-xs text-[var(--muted)]">{item.targetStartOn ? formatTargetWindow(item) : item.location}</p><div className="mt-2"><ReviewStatusPill status={reviewStatuses[item.reportId] ?? "needs_review"} /></div></div><ArrowRight className="mt-1 size-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]"/></div></button>)}</div></section>;
}

function AssetsView({ seed }: { seed: InspectionSeed }) {
  const grouped = Object.entries(seed.assets.reduce<Record<string, InspectionSeed["assets"]>>((groups, asset) => { (groups[asset.category] ??= []).push(asset); return groups; }, {}));
  return <div className="enter"><PageHeading eyebrow="What the house contains" title="Assets & systems" description={`${seed.assets.length} assets were identified from the inspection report. Verify model and installation details as you review them.`} /><div className="mt-7 grid gap-4 lg:grid-cols-2">{grouped.map(([category, assets]) => { const Icon = iconByCategory[category] ?? HardHat; return <section key={category} className="rounded-[24px] border border-black/6 bg-[var(--paper)] p-5 surface-shadow"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-[14px] bg-[var(--mint)] text-[var(--forest)]"><Icon className="size-[19px]"/></div><div><h2 className="font-display text-base font-extrabold">{category}</h2><p className="text-xs text-[var(--muted)]">{assets.length} {assets.length === 1 ? "asset" : "assets"}</p></div></div><div className="mt-4 divide-y divide-black/6">{assets.map((asset) => <div key={asset.key} className="flex items-center justify-between gap-3 py-3"><div><h3 className="text-sm font-bold">{asset.name}</h3><p className="mt-0.5 text-xs text-[var(--muted)]">{asset.area}{asset.manufacturedYear ? ` · ${asset.manufacturedYear}` : asset.installedYear ? ` · Installed ~${asset.installedYear}` : ""}</p></div><button type="button" className="grid size-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5" aria-label={`View ${asset.name}`}><ArrowRight className="size-4"/></button></div>)}</div></section>; })}</div></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">{eyebrow}</p><h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.05em] sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p></header>;
}

function MobileNav({ activeView, onChangeView, canAdd, onAdd }: { activeView: View; onChangeView: (view: View) => void; canAdd: boolean; onAdd: () => void }) {
  return <nav className="relative z-40 grid min-h-[72px] grid-cols-5 border-t border-black/8 bg-[var(--paper)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:hidden" aria-label="Mobile navigation">{navItems.slice(0, 2).map((item) => <MobileNavButton key={item.id} item={item} active={activeView === item.id} onClick={() => onChangeView(item.id)} />)}<button type="button" onClick={onAdd} disabled={!canAdd} className="mx-auto -mt-7 grid size-14 place-items-center rounded-[20px] bg-[var(--forest)] text-white shadow-xl shadow-[#214f3e]/25 disabled:cursor-not-allowed disabled:bg-[var(--muted)] disabled:opacity-55" aria-label={canAdd ? "Add work" : "Choose a property to add work"}><Plus className="size-6"/></button>{navItems.slice(2).map((item) => <MobileNavButton key={item.id} item={item} active={activeView === item.id} onClick={() => onChangeView(item.id)} />)}</nav>;
}

function MobileNavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button type="button" onClick={onClick} className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-extrabold ${active ? "text-[var(--forest)]" : "text-[var(--muted)]"}`} aria-current={active ? "page" : undefined}><Icon className="size-5" strokeWidth={active ? 2.5 : 1.9}/>{item.label}</button>;
}

type UploadPhase = "select" | "uploading" | "analyzing" | "review" | "importing";
type DocumentUploadType = "inspection" | "quote" | "invoice" | "receipt" | "photo";
type DocumentUploadResult =
  | (InspectionExtraction & { documentType: "inspection"; documentId: string; runId: string })
  | { documentType: "quote" | "invoice" | "receipt"; documentId: string; runId: string; normalized: NormalizedDocument }
  | { documentType: "photo"; documentId: string; runId: string; analysis: PhotoExtraction };

const documentTypeLabels: Record<DocumentUploadType, string> = {
  inspection: "Inspection report",
  quote: "Quote",
  invoice: "Invoice",
  receipt: "Receipt",
  photo: "Photo or screenshot",
};

function DocumentUploadDialog({ propertyId, seed, findings, initialWorkItem, onClose }: { propertyId: string; seed: InspectionSeed; findings: Finding[]; initialWorkItem: Finding | null; onClose: () => void }) {
  const [documentType, setDocumentType] = useState<DocumentUploadType>(initialWorkItem ? "quote" : "inspection");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("select");
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [error, setError] = useState("");

  const uploadAndAnalyze = async () => {
    if (!file) return;
    setError("");
    const isPhoto = documentType === "photo";
    const supportedImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
    if ((isPhoto ? !supportedImage : file.type !== "application/pdf") || file.size > 52_428_800) {
      setError(isPhoto ? "Choose a JPEG, PNG, WebP, or GIF image smaller than 50 MB." : "Choose a PDF smaller than 50 MB.");
      return;
    }
    const signature = isPhoto ? "" : new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (!isPhoto && signature !== "%PDF-") {
      setError("This file does not appear to be a valid PDF.");
      return;
    }

    try {
      setPhase("uploading");
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const intentResponse = await fetch("/api/documents/upload-intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId, documentType, filename: file.name, mimeType: file.type, byteSize: file.size, sha256 }),
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error ?? "Could not prepare the upload.");

      const supabase = createBrowserClient();
      const { error: uploadError } = await supabase.storage.from("documents").uploadToSignedUrl(intent.storageKey, intent.token, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      setPhase("analyzing");
      const processResponse = await fetch(`/api/documents/${intent.documentId}/process`, { method: "POST" });
      const processed = await processResponse.json();
      if (!processResponse.ok) throw new Error(processed.error ?? "The document could not be analyzed.");
      setResult(processed as DocumentUploadResult);
      setPhase("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be uploaded.");
      setPhase("select");
    }
  };

  const importFindings = async () => {
    if (!result || result.documentType !== "inspection") return;
    setError("");
    setPhase("importing");
    try {
      const response = await fetch(`/api/documents/${result.documentId}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: result.runId, replaceExisting, preserveSection: replaceExisting ? "10.4.1" : null }),
      });
      const imported = await response.json();
      if (!response.ok) throw new Error(imported.error ?? "The findings could not be imported.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The findings could not be imported.");
      setPhase("review");
    }
  };

  const busy = phase === "uploading" || phase === "analyzing" || phase === "importing";
  const selectedLabel = documentTypeLabels[documentType];
  return <div className="fixed inset-0 z-[60] grid items-end bg-[#0d1e17]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="document-upload-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--paper)] p-5 shadow-2xl sm:max-w-xl sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Private attachment import</p><h2 id="document-upload-title" className="font-display mt-1 text-2xl font-extrabold tracking-tight">{initialWorkItem ? "Attach a file" : "Upload a file"}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Houser privately stores the original file and uses OpenAI to extract searchable details for your review and chat.</p>{initialWorkItem ? <p className="mt-3 rounded-xl bg-[var(--mint)]/55 px-3 py-2 text-xs font-bold text-[var(--forest)]">Attaching to: {initialWorkItem.title}</p> : null}</div><button type="button" onClick={onClose} disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/5 disabled:opacity-40" aria-label="Close"><X className="size-5"/></button></div>
    {phase === "select" ? <div className="mt-6"><label className="block"><span className="text-xs font-extrabold">Attachment type</span><div className="relative mt-2"><select value={documentType} onChange={(event) => { setDocumentType(event.target.value as DocumentUploadType); setFile(null); setError(""); }} className="h-12 w-full appearance-none rounded-xl border border-black/10 bg-white px-4 pr-10 text-sm font-bold">{initialWorkItem ? null : <option value="inspection">Inspection report</option>}<option value="quote">Quote</option><option value="invoice">Invoice</option><option value="receipt">Receipt</option><option value="photo">Photo or screenshot</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/></div></label><label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--forest)]/25 bg-white/55 p-5 text-center"><Upload className="size-7 text-[var(--forest)]"/><span className="mt-3 text-sm font-extrabold">Choose {selectedLabel.toLowerCase()}</span><span className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">{documentType === "photo" ? "JPEG, PNG, WebP, or GIF" : "PDF"} · up to 50 MB · visible only to household members</span><input type="file" accept={documentType === "photo" ? "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" : "application/pdf,.pdf"} className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>{file ? <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[var(--mint)]/45 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-extrabold">{file.name}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{selectedLabel} · {(file.size / 1_048_576).toFixed(1)} MB</p></div><CheckCircle2 className="size-5 shrink-0 text-[var(--forest)]"/></div> : null}<button type="button" onClick={uploadAndAnalyze} disabled={!file} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--forest)] text-sm font-extrabold text-white disabled:opacity-40">Upload & analyze with OpenAI</button></div> : null}
    {phase === "uploading" || phase === "analyzing" ? <div className="mt-8 rounded-[20px] bg-[var(--mint)]/45 p-6 text-center"><Sparkles className="mx-auto size-7 animate-pulse text-[var(--forest)]"/><h3 className="mt-3 text-sm font-extrabold">{phase === "uploading" ? "Uploading privately…" : `Reading the ${selectedLabel.toLowerCase()}…`}</h3><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{phase === "uploading" ? "The original PDF is going into private document storage." : "OpenAI is extracting structured details and page evidence. Keep this window open."}</p></div> : null}
    {phase === "review" && result?.documentType === "inspection" ? <InspectionUploadReview result={result} replaceExisting={replaceExisting} onReplaceExisting={setReplaceExisting} onClose={onClose} onImport={importFindings} /> : null}
    {phase === "review" && result && ["quote", "invoice", "receipt"].includes(result.documentType) ? <FinancialDocumentUploadReview result={result as Extract<DocumentUploadResult, { documentType: "quote" | "invoice" | "receipt" }>} findings={findings} categories={[...new Set(seed.findings.map((item) => item.category))].sort()} areas={seed.areas} initialWorkItem={initialWorkItem} onClose={onClose} /> : null}
    {phase === "review" && result?.documentType === "photo" ? <PhotoUploadReview result={result} findings={findings} categories={[...new Set(seed.findings.map((item) => item.category))].sort()} areas={seed.areas} initialWorkItem={initialWorkItem} onClose={onClose} /> : null}
    {phase === "importing" ? <div className="mt-8 rounded-[20px] bg-[var(--mint)]/45 p-6 text-center"><Sparkles className="mx-auto size-7 animate-pulse text-[var(--forest)]"/><h3 className="mt-3 text-sm font-extrabold">Updating the work list…</h3><p className="mt-2 text-xs text-[var(--muted)]">The replacement is performed as one database transaction.</p></div> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold leading-5 text-[#8c3328]">{error}</p> : null}
  </section></div>;
}

function InspectionUploadReview({ result, replaceExisting, onReplaceExisting, onClose, onImport }: { result: Extract<DocumentUploadResult, { documentType: "inspection" }>; replaceExisting: boolean; onReplaceExisting: (value: boolean) => void; onClose: () => void; onImport: () => void }) {
  return <div className="mt-6"><div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-[var(--forest)]"/><div><p className="text-sm font-extrabold">{result.findings.length} findings proposed</p><p className="mt-0.5 text-xs text-[var(--muted)]">{result.report.propertyAddress ?? "Inspection report"} · {result.report.pageCount} pages</p></div></div></div>{result.reviewWarnings.length ? <div className="mt-3 rounded-xl bg-[#f9e6c8] p-3 text-xs leading-5 text-[#6f4c1d]">{result.reviewWarnings.join(" ")}</div> : null}<div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">{result.findings.slice(0, 12).map((finding) => <div key={finding.sourceSection} className="rounded-xl border border-black/6 bg-white/65 p-3"><div className="flex justify-between gap-3"><p className="text-xs font-extrabold">{finding.title}</p><span className="shrink-0 text-[10px] font-bold text-[var(--forest)]">{finding.sourceSection}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">{finding.category} · {formatSourcePages(finding.sourcePages)}</p></div>)}{result.findings.length > 12 ? <p className="py-2 text-center text-xs font-bold text-[var(--muted)]">Plus {result.findings.length - 12} more findings</p> : null}</div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-black/8 bg-white/60 p-4"><input type="checkbox" checked={replaceExisting} onChange={(event) => onReplaceExisting(event.target.checked)} className="mt-0.5 size-4 accent-[var(--forest)]"/><span><span className="block text-xs font-extrabold">Replace earlier inspection findings</span><span className="mt-1 block text-[11px] leading-5 text-[var(--muted)]">Removes older inspection-generated items, keeps manual work, and preserves section 10.4.1 with its status and history.</span></span></label><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)]">Cancel</button><button type="button" onClick={onImport} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white">Approve & import findings</button></div></div>;
}

function FinancialDocumentUploadReview({ result, findings, categories, areas, initialWorkItem, onClose }: { result: Extract<DocumentUploadResult, { documentType: "quote" | "invoice" | "receipt" }>; findings: Finding[]; categories: string[]; areas: string[]; initialWorkItem: Finding | null; onClose: () => void }) {
  const document = result.normalized;
  const vendor = document.vendor.name.value ?? "Vendor not identified";
  const total = document.financials.total.amountMinor;
  const warnings = [...document.review.warnings, ...document.review.unresolvedFields.map((field) => `Review ${field}.`)];
  const proposedWork = document.proposedRecords.workItems[0];
  const suggestedCategory = proposedWork?.category ?? document.scopeItems[0]?.category ?? "General";
  const suggestedArea = proposedWork?.area ?? document.scopeItems[0]?.area ?? "General";
  const categoryChoices = [...new Set([suggestedCategory, ...categories])];
  const areaChoices = [...new Set([suggestedArea, ...areas])];
  const [destination, setDestination] = useState<"new" | "existing">(initialWorkItem ? "existing" : "new");
  const [title, setTitle] = useState(proposedWork?.title ?? document.document.title);
  const [category, setCategory] = useState(suggestedCategory);
  const [area, setArea] = useState(suggestedArea);
  const [description, setDescription] = useState(document.document.summary);
  const [searchQuery, setSearchQuery] = useState(initialWorkItem?.title ?? "");
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(initialWorkItem?.workItemId ?? null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSavingDestination, setIsSavingDestination] = useState(false);
  const [destinationError, setDestinationError] = useState("");
  const matchingFindings = useMemo(() => {
    return filterFindings(findings, { query: searchQuery, severity: "all", category: "all" })
      .filter((item): item is Finding & { workItemId: string } => Boolean(item.workItemId))
      .slice(0, 8);
  }, [findings, searchQuery]);

  const saveDestination = async () => {
    setDestinationError("");
    setIsSavingDestination(true);
    try {
      if (destination === "existing") {
        if (!selectedWorkItemId) throw new Error("Choose an existing work item first.");
        await saveDocumentWorkDestinationAction({ documentId: result.documentId, destination, existingWorkItemId: selectedWorkItemId });
      } else {
        await saveDocumentWorkDestinationAction({
          documentId: result.documentId,
          destination,
          title,
          category,
          area,
          description,
          workType: proposedWork?.workType ?? "other",
          estimatedCostMinor: result.documentType === "quote" ? total : null,
          currency: document.financials.total.currency,
        });
      }
      window.location.reload();
    } catch (error) {
      setDestinationError(error instanceof Error ? error.message : "The document could not be linked to work.");
      setIsSavingDestination(false);
    }
  };

  return <div className="mt-6"><div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 shrink-0 text-[var(--forest)]"/><div className="min-w-0"><p className="text-sm font-extrabold">{result.documentType === "invoice" ? "Invoice extracted" : result.documentType === "receipt" ? "Receipt extracted" : "Quote extracted"}</p><p className="mt-1 truncate text-xs font-bold">{document.document.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{vendor}{total === null ? "" : ` · ${formatMoney(total, document.financials.total.currency)}`}</p></div></div></div><dl className="mt-4 grid grid-cols-2 gap-2"><Detail label="Issued" value={document.document.issuedOn.value ?? "Not found"}/><Detail label="Reference" value={document.document.externalReference.value ?? "Not found"}/><Detail label="Scope items" value={String(document.scopeItems.length)}/><Detail label="Status" value={document.document.acceptanceStatus}/></dl>{warnings.length ? <div className="mt-3 rounded-xl bg-[#f9e6c8] p-3 text-xs leading-5 text-[#6f4c1d]">{warnings.slice(0, 5).join(" ")}</div> : null}<div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">{document.scopeItems.map((item) => <div key={item.key} className="rounded-xl border border-black/6 bg-white/65 p-3"><div className="flex justify-between gap-3"><p className="text-xs font-extrabold">{item.description}</p>{item.amount?.amountMinor === null || !item.amount ? null : <span className="shrink-0 text-xs font-extrabold text-[var(--forest)]">{formatMoney(item.amount.amountMinor, item.amount.currency)}</span>}</div><p className="mt-1 text-[10px] text-[var(--muted)]">{item.category ?? item.kind} · {formatSourcePages(item.evidence.pages)}</p></div>)}</div>
    <section className="mt-5 border-t border-black/8 pt-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Add to work</p><h3 className="font-display mt-1 text-lg font-extrabold">{initialWorkItem ? `Attach to ${initialWorkItem.title}` : "What should this document do?"}</h3>{initialWorkItem ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">The original PDF will be added to this item’s Documents section after you approve the extracted details.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" aria-pressed={destination === "new"} onClick={() => setDestination("new")} className={`min-h-12 rounded-xl px-4 text-sm font-extrabold ${destination === "new" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}>Create new work item</button><button type="button" aria-pressed={destination === "existing"} onClick={() => setDestination("existing")} className={`min-h-12 rounded-xl px-4 text-sm font-extrabold ${destination === "existing" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}>Attach to existing</button></div>}
      {!initialWorkItem && destination === "new" ? <div className="mt-4 space-y-3 rounded-[18px] border border-black/7 bg-white/55 p-4"><label className="block"><span className="text-xs font-extrabold">Work item title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"/></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-extrabold">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{categoryChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label><label><span className="text-xs font-extrabold">Area</span><select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{areaChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label></div><label className="block"><span className="text-xs font-extrabold">Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm leading-5"/></label></div>
        : !initialWorkItem ? <div className="relative mt-4 rounded-[18px] border border-black/7 bg-white/55 p-4"><label className="block"><span className="text-xs font-extrabold">Find an existing work item</span><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/><input role="combobox" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="existing-work-options" value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSelectedWorkItemId(null); setSearchOpen(true); }} placeholder="Search by title, category, or area" className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 text-sm"/></div></label>{searchOpen ? <div id="existing-work-options" role="listbox" className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-black/8 bg-white p-1 shadow-lg">{matchingFindings.length ? matchingFindings.map((item) => <button key={item.workItemId} type="button" role="option" aria-selected={selectedWorkItemId === item.workItemId} onClick={() => { setSelectedWorkItemId(item.workItemId); setSearchQuery(item.title); setSearchOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-[var(--mint)]"><span className="block text-xs font-extrabold">{item.title}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{item.category} · {item.area}</span></button>) : <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No matching work items</p>}</div> : null}{selectedWorkItemId && !searchOpen ? <p className="mt-2 flex items-center gap-1.5 text-xs font-extrabold text-[var(--forest)]"><CheckCircle2 className="size-4"/> Selected work item</p> : null}</div> : null}
      {destinationError ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{destinationError}</p> : null}<p className="mt-3 text-xs leading-5 text-[var(--muted)]">The original private PDF and extracted details will remain linked to the work item.</p></section>
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><a href={`/api/documents/${result.documentId}/view`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold text-[var(--forest)]">Open original <ExternalLink className="size-3.5"/></a><button type="button" onClick={onClose} disabled={isSavingDestination} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] disabled:opacity-50">Not now</button><button type="button" onClick={saveDestination} disabled={isSavingDestination || (destination === "new" ? !title.trim() : !selectedWorkItemId)} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white disabled:opacity-40">{isSavingDestination ? "Saving…" : destination === "new" ? "Create & attach" : "Attach document"}</button></div></div>;
}

function PhotoUploadReview({ result, findings, categories, areas, initialWorkItem, onClose }: { result: Extract<DocumentUploadResult, { documentType: "photo" }>; findings: Finding[]; categories: string[]; areas: string[]; initialWorkItem: Finding | null; onClose: () => void }) {
  const analysis = result.analysis;
  const categoryChoices = categories.length ? categories : ["General"];
  const areaChoices = areas.length ? areas : ["General"];
  const [destination, setDestination] = useState<"new" | "existing">(initialWorkItem ? "existing" : analysis.suggestedWorkTitle ? "new" : "existing");
  const [title, setTitle] = useState(analysis.suggestedWorkTitle ?? analysis.title);
  const [description, setDescription] = useState(analysis.suggestedWorkDescription ?? analysis.summary);
  const [category, setCategory] = useState(categoryChoices.includes(analysis.category ?? "") ? analysis.category! : categoryChoices[0]);
  const [area, setArea] = useState(areaChoices.includes(analysis.area ?? "") ? analysis.area! : areaChoices[0]);
  const [searchQuery, setSearchQuery] = useState(initialWorkItem?.title ?? "");
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(initialWorkItem?.workItemId ?? null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const matchingFindings = findings.filter((item) => item.workItemId && `${item.title} ${item.category} ${item.area}`.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 8);

  const save = async () => {
    setIsSaving(true);
    setSaveError("");
    try {
      if (destination === "existing") {
        if (!selectedWorkItemId) throw new Error("Choose a work item for this photo.");
        await saveDocumentWorkDestinationAction({ documentId: result.documentId, destination: "existing", existingWorkItemId: selectedWorkItemId });
      } else {
        await saveDocumentWorkDestinationAction({
          documentId: result.documentId,
          destination: "new",
          title,
          category,
          area,
          description,
          workType: "other",
          estimatedCostMinor: null,
          currency: "USD",
        });
      }
      window.location.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The photo could not be linked to work.");
      setIsSaving(false);
    }
  };

  return <div className="mt-6"><div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--forest)] text-white"><ImageIcon className="size-5"/></div><div className="min-w-0"><p className="text-sm font-extrabold">Photo analyzed</p><p className="mt-1 text-xs font-bold">{analysis.title}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{analysis.summary}</p></div></div>{analysis.observations.length ? <ul className="mt-3 space-y-1 text-xs leading-5">{analysis.observations.slice(0, 5).map((observation) => <li key={observation}>• {observation}</li>)}</ul> : null}{analysis.safetyConcerns.length ? <div className="mt-3 rounded-xl bg-[#f8ddd7] p-3 text-xs leading-5 text-[#8c3328]">Possible safety concern: {analysis.safetyConcerns.join(" ")}</div> : null}</div>
    <section className="mt-5 border-t border-black/8 pt-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Add to work</p><h3 className="font-display mt-1 text-lg font-extrabold">{initialWorkItem ? `Attach to ${initialWorkItem.title}` : "Where should this photo live?"}</h3>{initialWorkItem ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">The original photo and its searchable analysis will be attached to this item.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" aria-pressed={destination === "new"} onClick={() => setDestination("new")} className={`min-h-12 rounded-xl px-4 text-sm font-extrabold ${destination === "new" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}>Create new work item</button><button type="button" aria-pressed={destination === "existing"} onClick={() => setDestination("existing")} className={`min-h-12 rounded-xl px-4 text-sm font-extrabold ${destination === "existing" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}>Attach to existing</button></div>}
      {!initialWorkItem && destination === "new" ? <div className="mt-4 space-y-3 rounded-[18px] border border-black/7 bg-white/55 p-4"><label className="block"><span className="text-xs font-extrabold">Work item title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"/></label><label className="block"><span className="text-xs font-extrabold">Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm leading-5"/></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-extrabold">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{categoryChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label><label><span className="text-xs font-extrabold">Area</span><select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{areaChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label></div></div> : !initialWorkItem ? <div className="relative mt-4 rounded-[18px] border border-black/7 bg-white/55 p-4"><label className="block"><span className="text-xs font-extrabold">Find an existing work item</span><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/><input role="combobox" aria-controls="photo-work-options" aria-expanded={searchOpen} value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSelectedWorkItemId(null); setSearchOpen(true); }} placeholder="Search work items" className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 text-sm"/></div></label>{searchOpen ? <div id="photo-work-options" role="listbox" className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-black/8 bg-white p-1 shadow-lg">{matchingFindings.length ? matchingFindings.map((item) => <button key={item.workItemId} type="button" role="option" aria-selected={selectedWorkItemId === item.workItemId} onClick={() => { setSelectedWorkItemId(item.workItemId!); setSearchQuery(item.title); setSearchOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-[var(--mint)]"><span className="block text-xs font-extrabold">{item.title}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{item.category} · {item.area}</span></button>) : <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No matching work items</p>}</div> : null}</div> : null}
      {saveError ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{saveError}</p> : null}</section>
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><a href={`/api/documents/${result.documentId}/view`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold text-[var(--forest)]">Open original <ExternalLink className="size-3.5"/></a><button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] disabled:opacity-50">Not now</button><button type="button" onClick={save} disabled={isSaving || (destination === "new" ? !title.trim() : !selectedWorkItemId)} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white disabled:opacity-40">{isSaving ? "Saving…" : destination === "new" ? "Create & attach" : "Attach photo"}</button></div></div>;
}

function AddWorkDialog({ seed, onClose, onAdd, onUpload }: { seed: InspectionSeed; onClose: () => void; onAdd: (item: LocalWorkItem) => Promise<void>; onUpload: () => void }) {
  const categories = [...new Set(seed.findings.map((item) => item.category))].sort();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
      await onAdd({ reportId: `manual-${Date.now()}`, title: title.trim(), category, area, workType: "other", severity: "recommendation", priority: "routine", location: area, suggestedAction: description.trim(), sourcePages: [], isLocal: true });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The work item could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 grid items-end bg-[#0d1e17]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="add-work-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--paper)] p-5 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Quick capture</p><h2 id="add-work-title" className="font-display mt-1 text-2xl font-extrabold tracking-tight">Add work</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-black/5" aria-label="Close"><X className="size-5"/></button></div><button type="button" onClick={onUpload} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--forest)]/20 bg-[var(--mint)]/50 text-sm font-extrabold text-[var(--forest)]"><Upload className="size-[18px]" /> Upload a document</button><div className="my-5 flex items-center gap-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]"><span className="h-px flex-1 bg-black/8" />or add one item<span className="h-px flex-1 bg-black/8" /></div><form onSubmit={submit} className="space-y-4"><label className="block"><span className="text-xs font-extrabold">What needs to be done?</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Service upstairs furnace" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-sm"/></label><label className="block"><span className="text-xs font-extrabold">Description <span className="font-normal text-[var(--muted)]">(optional)</span></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={3} placeholder="Add useful details, symptoms, or next steps" className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white px-4 py-3 text-sm leading-6"/></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="text-xs font-extrabold">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{categories.map((name) => <option key={name}>{name}</option>)}</select></label><label><span className="text-xs font-extrabold">Area</span><select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{seed.areas.map((name) => <option key={name}>{name}</option>)}</select></label></div><button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 text-sm font-bold text-[var(--muted)]"><Camera className="size-[18px]"/> Add photo or screenshot</button>{saveError ? <p role="alert" className="rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{saveError}</p> : null}<button type="submit" disabled={!title.trim() || isSaving} className="min-h-12 w-full rounded-xl bg-[var(--forest)] text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">{isSaving ? "Saving…" : "Save to work inbox"}</button></form></div></div>;
}
