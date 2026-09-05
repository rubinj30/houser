"use client";

import { ArrowRight, Camera, CheckCircle2, ChevronDown, ExternalLink, FileText, FolderOpen, Home, Image as ImageIcon, Images, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { saveDocumentWorkDestinationAction } from "@/app/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { NormalizedDocument } from "@/lib/document-extraction";
import { filterFindings, formatSourcePages } from "@/lib/findings";
import type { InspectionExtraction } from "@/lib/inspection-extraction";
import type { PhotoExtraction } from "@/lib/photo-extraction";
import type { Finding, InspectionSeed } from "@/lib/types";

type UploadPhase = "select" | "uploading" | "analyzing" | "review" | "importing";
export type DocumentUploadType = "inspection" | "quote" | "invoice" | "receipt" | "photo";
type UploadDestination = "new" | "existing";
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

export function validateUploadFile(type: DocumentUploadType, file: Pick<File, "type" | "size">) {
  const isPhoto = type === "photo";
  const supportedImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
  if ((isPhoto ? !supportedImage : file.type !== "application/pdf") || file.size > 52_428_800) {
    return isPhoto ? "Choose a JPEG, PNG, WebP, or GIF image smaller than 50 MB." : "Choose a PDF smaller than 50 MB.";
  }
  return null;
}

async function uploadAndProcessDocument(propertyId: string, documentType: DocumentUploadType, file: File, onPhase: (phase: UploadPhase) => void) {
  const validationError = validateUploadFile(documentType, file);
  if (validationError) throw new Error(validationError);
  if (documentType !== "photo") {
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") throw new Error("This file does not appear to be a valid PDF.");
  }

  onPhase("uploading");
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

  onPhase("analyzing");
  const processResponse = await fetch(`/api/documents/${intent.documentId}/process`, { method: "POST" });
  const processed = await processResponse.json();
  if (!processResponse.ok) throw new Error(processed.error ?? "The document could not be analyzed.");
  return processed as DocumentUploadResult;
}

function useDocumentUpload(propertyId: string, initialType: DocumentUploadType) {
  const [documentType, setDocumentType] = useState<DocumentUploadType>(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("select");
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [error, setError] = useState("");

  const analyze = async () => {
    if (!file) return;
    setError("");
    try {
      const processed = await uploadAndProcessDocument(propertyId, documentType, file, setPhase);
      setResult(processed);
      setPhase("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be uploaded.");
      setPhase("select");
    }
  };

  const changeType = (nextType: DocumentUploadType) => {
    setDocumentType(nextType);
    setFile(null);
    setResult(null);
    setError("");
  };
  const chooseFile = (nextFile: File | null, nextType = documentType) => {
    setDocumentType(nextType);
    setFile(nextFile);
    setResult(null);
    setError("");
  };
  return { documentType, changeType, file, chooseFile, phase, setPhase, result, error, setError, analyze };
}

function AttachmentSourcePicker({ documentType, onChoose }: { documentType: DocumentUploadType; onChoose: (file: File | null, type?: DocumentUploadType) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileAccept = documentType === "photo" ? "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" : "application/pdf,.pdf";
  const select = (event: React.ChangeEvent<HTMLInputElement>, type?: DocumentUploadType) => {
    onChoose(event.target.files?.[0] ?? null, type);
    event.currentTarget.value = "";
  };

  return <fieldset className="rounded-[20px] border border-black/7 bg-white/55 p-4">
    <legend className="px-1 text-xs font-extrabold">Add from</legend>
    <div className="mt-1 grid grid-cols-3 gap-2">
      <button type="button" onClick={() => fileInput.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-2 text-center text-xs font-extrabold transition hover:border-[var(--forest)]/25 hover:bg-[var(--mint)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--forest)]"><FolderOpen className="size-5 text-[var(--forest)]"/>Files</button>
      <button type="button" onClick={() => photoInput.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-2 text-center text-xs font-extrabold transition hover:border-[var(--forest)]/25 hover:bg-[var(--mint)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--forest)]"><Images className="size-5 text-[var(--forest)]"/>Photos</button>
      <button type="button" onClick={() => cameraInput.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-black/8 bg-white px-2 text-center text-xs font-extrabold transition hover:border-[var(--forest)]/25 hover:bg-[var(--mint)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--forest)]"><Camera className="size-5 text-[var(--forest)]"/>Camera</button>
    </div>
    <p className="mt-3 text-center text-[10px] leading-4 text-[var(--muted)]">Photos and Camera automatically use the photo attachment type.</p>
    <input ref={fileInput} type="file" accept={fileAccept} aria-label="Choose attachment from Files" className="sr-only" onChange={(event) => select(event)}/>
    <input ref={photoInput} type="file" accept="image/*" aria-label="Choose attachment from Photos" className="sr-only" onChange={(event) => select(event, "photo")}/>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="Take a photo with Camera" className="sr-only" onChange={(event) => select(event, "photo")}/>
  </fieldset>;
}

function matchingWork(findings: Finding[], query: string) {
  return filterFindings(findings, { query, severity: "all", category: "all" })
    .filter((item): item is Finding & { workItemId: string } => Boolean(item.workItemId))
    .slice(0, 8);
}

function WorkItemSearch({ findings, query, selectedId, onQuery, onSelect, id }: { findings: Finding[]; query: string; selectedId: string | null; onQuery: (value: string) => void; onSelect: (item: Finding & { workItemId: string }) => void; id: string }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => matchingWork(findings, query), [findings, query]);
  return <div className="relative mt-3 rounded-[18px] border border-black/7 bg-white/55 p-4"><label className="block"><span className="text-xs font-extrabold">Find an existing work item</span><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/><input role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id} value={query} onFocus={() => setOpen(true)} onChange={(event) => { onQuery(event.target.value); setOpen(true); }} placeholder="Search by title, category, or area" className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 text-sm"/></div></label>{open ? <div id={id} role="listbox" className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-black/8 bg-white p-1 shadow-lg">{matches.length ? matches.map((item) => <button key={item.workItemId} type="button" role="option" aria-selected={selectedId === item.workItemId} onClick={() => { onSelect(item); setOpen(false); }} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-[var(--mint)]"><span className="block text-xs font-extrabold">{item.title}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{item.category} · {item.area}</span></button>) : <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No matching work items</p>}</div> : null}{selectedId && !open ? <p className="mt-2 flex items-center gap-1.5 text-xs font-extrabold text-[var(--forest)]"><CheckCircle2 className="size-4"/> Selected work item</p> : null}</div>;
}

function DestinationChoice({ value, onChange, newLabel = "Create new work item" }: { value: UploadDestination; onChange: (value: UploadDestination) => void; newLabel?: string }) {
  return <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" aria-pressed={value === "new"} onClick={() => onChange("new")} className={`min-h-12 rounded-xl px-4 text-sm font-extrabold ${value === "new" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}>{newLabel}</button><button type="button" aria-pressed={value === "existing"} onClick={() => onChange("existing")} className={`min-h-12 rounded-xl px-4 text-sm font-extrabold ${value === "existing" ? "bg-[var(--forest)] text-white" : "border border-black/10 bg-white"}`}>Attach to existing</button></div>;
}

type WorkDraft = { title: string; description: string; category: string; area: string; workType: string; estimatedCostMinor: number | null; currency: string };

function WorkDestinationEditor({ documentId, kind, findings, categories, areas, initialWorkItem, initialDraft, onClose }: { documentId: string; kind: "document" | "photo"; findings: Finding[]; categories: string[]; areas: string[]; initialWorkItem: Finding | null; initialDraft: WorkDraft; onClose: () => void }) {
  const [destination, setDestination] = useState<UploadDestination>(initialWorkItem ? "existing" : "new");
  const [draft, setDraft] = useState(initialDraft);
  const [query, setQuery] = useState(initialWorkItem?.title ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(initialWorkItem?.workItemId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const categoryChoices = [...new Set([draft.category, ...categories])];
  const areaChoices = [...new Set([draft.area, ...areas])];
  const update = (field: keyof WorkDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (destination === "existing") {
        if (!selectedId) throw new Error(`Choose a work item for this ${kind}.`);
        await saveDocumentWorkDestinationAction({ documentId, destination, existingWorkItemId: selectedId });
      } else {
        await saveDocumentWorkDestinationAction({ documentId, destination, ...draft });
      }
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `The ${kind} could not be linked to work.`);
      setSaving(false);
    }
  };

  return <section className="mt-5 border-t border-black/8 pt-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">Add to work</p><h3 className="font-display mt-1 text-lg font-extrabold">{initialWorkItem ? `Attach to ${initialWorkItem.title}` : `Where should this ${kind} live?`}</h3>{initialWorkItem ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">The original file and searchable extracted details will be attached to this item.</p> : <DestinationChoice value={destination} onChange={setDestination}/>} {!initialWorkItem && destination === "new" ? <div className="mt-4 space-y-3 rounded-[18px] border border-black/7 bg-white/55 p-4"><label className="block"><span className="text-xs font-extrabold">Work item title</span><input value={draft.title} onChange={(event) => update("title", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"/></label><label className="block"><span className="text-xs font-extrabold">Description</span><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white p-3 text-sm leading-5"/></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-extrabold">Category</span><select value={draft.category} onChange={(event) => update("category", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{categoryChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label><label><span className="text-xs font-extrabold">Area</span><select value={draft.area} onChange={(event) => update("area", event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{areaChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label></div></div> : !initialWorkItem ? <WorkItemSearch id={`${kind}-work-options`} findings={findings} query={query} selectedId={selectedId} onQuery={(value) => { setQuery(value); setSelectedId(null); }} onSelect={(item) => { setSelectedId(item.workItemId); setQuery(item.title); }}/>: null}{error ? <p role="alert" className="mt-3 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold text-[#8c3328]">{error}</p> : null}<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><a href={`/api/documents/${documentId}/view`} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold text-[var(--forest)]">Open original <ExternalLink className="size-3.5"/></a><button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)] disabled:opacity-50">Not now</button><button type="button" onClick={() => void save()} disabled={saving || (destination === "new" ? !draft.title.trim() : !selectedId)} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white disabled:opacity-40">{saving ? "Saving…" : destination === "new" ? "Create & attach" : `Attach ${kind}`}</button></div></section>;
}

export function DocumentUploadDialog({ propertyId, seed, findings, initialWorkItem, onClose }: { propertyId: string; seed: InspectionSeed; findings: Finding[]; initialWorkItem: Finding | null; onClose: () => void }) {
  const upload = useDocumentUpload(propertyId, initialWorkItem ? "quote" : "inspection");
  const [destination, setDestination] = useState<UploadDestination>(initialWorkItem ? "existing" : "new");
  const [selectedId, setSelectedId] = useState<string | null>(initialWorkItem?.workItemId ?? null);
  const [query, setQuery] = useState(initialWorkItem?.title ?? "");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const selectedWorkItem = initialWorkItem ?? findings.find((item) => item.workItemId === selectedId) ?? null;
  const busy = upload.phase === "uploading" || upload.phase === "analyzing" || upload.phase === "importing";
  const label = documentTypeLabels[upload.documentType];
  const categories = [...new Set(seed.findings.map((item) => item.category))].sort();

  const finishInspection = async () => {
    if (!upload.result || upload.result.documentType !== "inspection") return;
    upload.setError("");
    upload.setPhase("importing");
    try {
      if (destination === "existing") {
        if (!selectedId) throw new Error("Choose a work item for this inspection.");
        await saveDocumentWorkDestinationAction({ documentId: upload.result.documentId, destination, existingWorkItemId: selectedId });
        window.location.reload();
        return;
      }
      const response = await fetch(`/api/documents/${upload.result.documentId}/import`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: upload.result.runId, replaceExisting, preserveSection: replaceExisting ? "10.4.1" : null }) });
      const imported = await response.json();
      if (!response.ok) throw new Error(imported.error ?? "The findings could not be imported.");
      window.location.reload();
    } catch (cause) {
      upload.setError(cause instanceof Error ? cause.message : "The inspection could not be saved.");
      upload.setPhase("review");
    }
  };

  return <div className="fixed inset-0 z-[60] grid items-end bg-[#0d1e17]/45 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="document-upload-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--paper)] p-5 shadow-2xl sm:max-w-xl sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--forest)]">Private attachment import</p><h2 id="document-upload-title" className="font-display mt-1 text-2xl font-extrabold tracking-tight">{initialWorkItem ? "Attach a file" : "Upload a file"}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Houser privately stores the original and extracts searchable details for your review and chat.</p>{initialWorkItem ? <p className="mt-3 rounded-xl bg-[var(--mint)]/55 px-3 py-2 text-xs font-bold text-[var(--forest)]">Attaching to: {initialWorkItem.title}</p> : null}</div><button type="button" onClick={onClose} disabled={busy} className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/5 disabled:opacity-40" aria-label="Close"><X className="size-5"/></button></div>
    {upload.phase === "select" ? <div className="mt-6 space-y-5">{!initialWorkItem ? <section aria-labelledby="upload-destination-label"><p id="upload-destination-label" className="text-xs font-extrabold">Where should this file go?</p><DestinationChoice value={destination} onChange={setDestination} newLabel="Create work from file"/>{destination === "existing" ? <WorkItemSearch id="upload-work-options" findings={findings} query={query} selectedId={selectedId} onQuery={(value) => { setQuery(value); setSelectedId(null); }} onSelect={(item) => { setSelectedId(item.workItemId); setQuery(item.title); }}/> : null}<Link href="/household?addProperty=1#add-property-form" className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-xs font-extrabold text-[var(--forest)] transition hover:bg-[var(--mint)]/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--forest)]"><span className="flex items-center gap-2"><Home className="size-4"/>This file belongs to a new property</span><span className="flex items-center gap-1">Add property <ArrowRight className="size-3.5"/></span></Link></section> : null}<label className="block"><span className="text-xs font-extrabold">Attachment type</span><div className="relative mt-2"><select value={upload.documentType} onChange={(event) => upload.changeType(event.target.value as DocumentUploadType)} className="h-12 w-full appearance-none rounded-xl border border-black/10 bg-white px-4 pr-10 text-sm font-bold">{initialWorkItem ? null : <option value="inspection">Inspection report</option>}<option value="quote">Quote</option><option value="invoice">Invoice</option><option value="receipt">Receipt</option><option value="photo">Photo or screenshot</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/></div></label><AttachmentSourcePicker documentType={upload.documentType} onChoose={upload.chooseFile}/>{upload.file ? <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--mint)]/45 px-4 py-3"><div className="min-w-0"><p className="truncate text-xs font-extrabold">{upload.file.name}</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">{label} · {(upload.file.size / 1_048_576).toFixed(1)} MB</p></div><CheckCircle2 className="size-5 shrink-0 text-[var(--forest)]"/></div> : null}<p className="text-center text-[10px] leading-4 text-[var(--muted)]">{upload.documentType === "photo" ? "JPEG, PNG, WebP, or GIF" : "PDF"} · up to 50 MB · visible only to household members</p><button type="button" onClick={() => void upload.analyze()} disabled={!upload.file || (destination === "existing" && !selectedId)} className="min-h-12 w-full rounded-xl bg-[var(--forest)] text-sm font-extrabold text-white disabled:opacity-40">Upload & analyze with OpenAI</button></div> : null}
    {upload.phase === "uploading" || upload.phase === "analyzing" ? <div className="mt-8 rounded-[20px] bg-[var(--mint)]/45 p-6 text-center"><Sparkles className="mx-auto size-7 animate-pulse text-[var(--forest)]"/><h3 className="mt-3 text-sm font-extrabold">{upload.phase === "uploading" ? "Uploading privately…" : `Reading the ${label.toLowerCase()}…`}</h3><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{upload.phase === "uploading" ? "The original is going into private document storage." : "OpenAI is extracting structured details and page evidence. Keep this window open."}</p></div> : null}
    {upload.phase === "review" && upload.result?.documentType === "inspection" ? <InspectionReview result={upload.result} destination={destination} workItem={selectedWorkItem} replaceExisting={replaceExisting} onReplace={setReplaceExisting} onClose={onClose} onSave={() => void finishInspection()}/> : null}
    {upload.phase === "review" && upload.result && ["quote", "invoice", "receipt"].includes(upload.result.documentType) ? <FinancialReview result={upload.result as Extract<DocumentUploadResult, { documentType: "quote" | "invoice" | "receipt" }>} findings={findings} categories={categories} areas={seed.areas} workItem={destination === "existing" ? selectedWorkItem : null} onClose={onClose}/> : null}
    {upload.phase === "review" && upload.result?.documentType === "photo" ? <PhotoReview result={upload.result} findings={findings} categories={categories} areas={seed.areas} workItem={destination === "existing" ? selectedWorkItem : null} onClose={onClose}/> : null}
    {upload.phase === "importing" ? <div className="mt-8 rounded-[20px] bg-[var(--mint)]/45 p-6 text-center"><Sparkles className="mx-auto size-7 animate-pulse text-[var(--forest)]"/><h3 className="mt-3 text-sm font-extrabold">Updating the work list…</h3><p className="mt-2 text-xs text-[var(--muted)]">The update is performed as one database transaction.</p></div> : null}{upload.error ? <p role="alert" className="mt-4 rounded-xl bg-[#f8ddd7] px-3 py-2 text-xs font-bold leading-5 text-[#8c3328]">{upload.error}</p> : null}</section></div>;
}

function InspectionReview({ result, destination, workItem, replaceExisting, onReplace, onClose, onSave }: { result: Extract<DocumentUploadResult, { documentType: "inspection" }>; destination: UploadDestination; workItem: Finding | null; replaceExisting: boolean; onReplace: (value: boolean) => void; onClose: () => void; onSave: () => void }) {
  return <div className="mt-6"><div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-[var(--forest)]"/><div><p className="text-sm font-extrabold">{result.findings.length} findings proposed</p><p className="mt-0.5 text-xs text-[var(--muted)]">{result.report.propertyAddress ?? "Inspection report"} · {result.report.pageCount} pages</p></div></div></div>{result.reviewWarnings.length ? <div className="mt-3 rounded-xl bg-[#f9e6c8] p-3 text-xs leading-5 text-[#6f4c1d]">{result.reviewWarnings.join(" ")}</div> : null}<div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">{result.findings.slice(0, 12).map((finding) => <div key={finding.sourceSection} className="rounded-xl border border-black/6 bg-white/65 p-3"><div className="flex justify-between gap-3"><p className="text-xs font-extrabold">{finding.title}</p><span className="shrink-0 text-[10px] font-bold text-[var(--forest)]">{finding.sourceSection}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">{finding.category} · {formatSourcePages(finding.sourcePages)}</p></div>)}</div>{destination === "existing" ? <div className="mt-4 rounded-xl border border-[var(--forest)]/12 bg-white/60 p-4"><p className="text-xs font-extrabold">Attach to {workItem?.title ?? "selected work item"}</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">The inspection and searchable analysis will be attached without importing separate work items.</p></div> : <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-black/8 bg-white/60 p-4"><input type="checkbox" checked={replaceExisting} onChange={(event) => onReplace(event.target.checked)} className="mt-0.5 size-4 accent-[var(--forest)]"/><span><span className="block text-xs font-extrabold">Replace earlier inspection findings</span><span className="mt-1 block text-[11px] leading-5 text-[var(--muted)]">Removes older inspection-generated items while preserving manually created work.</span></span></label>}<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-xs font-extrabold text-[var(--muted)]">Cancel</button><button type="button" onClick={onSave} className="min-h-11 rounded-xl bg-[var(--forest)] px-5 text-xs font-extrabold text-white">{destination === "existing" ? "Attach inspection report" : "Approve & import findings"}</button></div></div>;
}

function FinancialReview({ result, findings, categories, areas, workItem, onClose }: { result: Extract<DocumentUploadResult, { documentType: "quote" | "invoice" | "receipt" }>; findings: Finding[]; categories: string[]; areas: string[]; workItem: Finding | null; onClose: () => void }) {
  const document = result.normalized;
  const proposed = document.proposedRecords.workItems[0];
  const category = proposed?.category ?? document.scopeItems[0]?.category ?? "General";
  const area = proposed?.area ?? document.scopeItems[0]?.area ?? "General";
  const total = document.financials.total.amountMinor;
  return <div className="mt-6"><div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--forest)] text-white"><FileText className="size-5"/></div><div><p className="text-sm font-extrabold">{documentTypeLabels[result.documentType]} extracted</p><p className="mt-1 text-xs font-bold">{document.document.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{document.vendor.name.value ?? "Vendor not identified"}{total === null ? "" : ` · ${new Intl.NumberFormat("en-US", { style: "currency", currency: document.financials.total.currency }).format(total / 100)}`}</p></div></div></div><WorkDestinationEditor documentId={result.documentId} kind="document" findings={findings} categories={categories} areas={areas} initialWorkItem={workItem} initialDraft={{ title: proposed?.title ?? document.document.title, description: document.document.summary, category, area, workType: proposed?.workType ?? "other", estimatedCostMinor: result.documentType === "quote" ? total : null, currency: document.financials.total.currency }} onClose={onClose}/></div>;
}

function PhotoReview({ result, findings, categories, areas, workItem, onClose }: { result: Extract<DocumentUploadResult, { documentType: "photo" }>; findings: Finding[]; categories: string[]; areas: string[]; workItem: Finding | null; onClose: () => void }) {
  const analysis = result.analysis;
  return <div className="mt-6"><div className="rounded-[20px] bg-[var(--mint)]/55 p-4"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--forest)] text-white"><ImageIcon className="size-5"/></div><div><p className="text-sm font-extrabold">Photo analyzed</p><p className="mt-1 text-xs font-bold">{analysis.title}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{analysis.summary}</p></div></div>{analysis.observations.length ? <ul className="mt-3 space-y-1 text-xs leading-5">{analysis.observations.slice(0, 5).map((observation) => <li key={observation}>• {observation}</li>)}</ul> : null}</div><WorkDestinationEditor documentId={result.documentId} kind="photo" findings={findings} categories={categories} areas={areas} initialWorkItem={workItem} initialDraft={{ title: analysis.suggestedWorkTitle ?? analysis.title, description: analysis.suggestedWorkDescription ?? analysis.summary, category: analysis.category ?? categories[0] ?? "General", area: analysis.area ?? areas[0] ?? "General", workType: "other", estimatedCostMinor: null, currency: "USD" }} onClose={onClose}/></div>;
}
