import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import inspectionSeed from "../seed-data/sample-property-inspection.json" with { type: "json" };

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const sourceFile = args.get("--file");
const propertyName = args.get("--property") ?? inspectionSeed.property.displayName;
const pdftoppm = process.env.PDFTOPPM_PATH ?? "pdftoppm";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!sourceFile) throw new Error("Usage: npm run import:inspection -- --file /private/path/report.pdf");
if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const sourceStats = await stat(sourceFile);
const sourceBytes = await readFile(sourceFile);
const sha256 = createHash("sha256").update(sourceBytes).digest("hex");
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: property, error: propertyError } = await supabase
  .from("properties")
  .select("id")
  .eq("display_name", propertyName)
  .single();
if (propertyError) throw propertyError;

const originalFilename = inspectionSeed.source.originalFilename ?? basename(sourceFile);
const { data: existingDocument, error: existingError } = await supabase
  .from("documents")
  .select("id,storage_key")
  .eq("property_id", property.id)
  .eq("original_filename", originalFilename)
  .maybeSingle();
if (existingError) throw existingError;

const documentId = existingDocument?.id ?? randomUUID();
const documentYear = inspectionSeed.source.documentDate.slice(0, 4);
const storageKey = existingDocument?.storage_key ?? `${property.id}/${documentYear}/${documentId}/original.pdf`;
const documentValues = {
  id: documentId,
  property_id: property.id,
  document_type: "inspection",
  original_filename: originalFilename,
  mime_type: "application/pdf",
  byte_size: sourceStats.size,
  storage_key: storageKey,
  sha256,
  document_date: inspectionSeed.source.documentDate,
  status: "accepted",
};
const { error: documentError } = await supabase.from("documents").upsert(documentValues, { onConflict: "id" });
if (documentError) throw documentError;

const { error: pdfUploadError } = await supabase.storage
  .from("inspection-documents")
  .upload(storageKey, sourceBytes, { contentType: "application/pdf", upsert: true });
if (pdfUploadError) throw pdfUploadError;

const pageNumbers = [...new Set(inspectionSeed.findings.flatMap((finding) => finding.sourcePages))].sort((a, b) => a - b);
const renderDirectory = await mkdtemp(join(tmpdir(), "houser-evidence-"));

try {
  for (const pageNumber of pageNumbers) {
    const outputPrefix = join(renderDirectory, `page-${pageNumber}`);
    const rendered = spawnSync(pdftoppm, [
      "-f", String(pageNumber),
      "-l", String(pageNumber),
      "-jpeg",
      "-jpegopt", "quality=82,optimize=y",
      "-r", "120",
      "-singlefile",
      sourceFile,
      outputPrefix,
    ], { encoding: "utf8" });
    if (rendered.status !== 0) throw new Error(`Could not render page ${pageNumber}: ${rendered.stderr.trim()}`);

    const previewBytes = await readFile(`${outputPrefix}.jpg`);
    const previewStorageKey = `${property.id}/${documentYear}/${documentId}/pages/${pageNumber}.jpg`;
    const { error: previewUploadError } = await supabase.storage
      .from("inspection-documents")
      .upload(previewStorageKey, previewBytes, { contentType: "image/jpeg", upsert: true });
    if (previewUploadError) throw previewUploadError;

    const { error: pageError } = await supabase.from("document_pages").upsert({
      document_id: documentId,
      page_number: pageNumber,
      preview_storage_key: previewStorageKey,
    }, { onConflict: "document_id,page_number" });
    if (pageError) throw pageError;
  }
} finally {
  await rm(renderDirectory, { recursive: true, force: true });
}

const { error: workItemsError } = await supabase
  .from("work_items")
  .update({ source_document_id: documentId })
  .eq("property_id", property.id)
  .eq("source_type", "inspection")
  .eq("source_document_name", originalFilename);
if (workItemsError) throw workItemsError;

console.log(`Imported one private inspection report with ${pageNumbers.length} page previews and linked its work items.`);
