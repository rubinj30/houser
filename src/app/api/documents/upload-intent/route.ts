import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  propertyId: z.string().uuid(),
  documentType: z.enum(["inspection", "quote", "invoice", "receipt", "photo"]),
  filename: z.string().min(1).max(240),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]),
  byteSize: z.number().int().positive().max(52_428_800),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((value, context) => {
  if (value.documentType === "photo" && !value.mimeType.startsWith("image/")) {
    context.addIssue({ code: "custom", path: ["mimeType"], message: "Photos must be image files." });
  }
  if (value.documentType !== "photo" && value.mimeType !== "application/pdf") {
    context.addIssue({ code: "custom", path: ["mimeType"], message: "Documents must be PDFs." });
  }
});

const extensionByMimeType: Record<z.infer<typeof requestSchema>["mimeType"], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a supported PDF or image smaller than 50 MB." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = typeof auth?.claims?.sub === "string" ? auth.claims.sub : null;
  if (!userId) return NextResponse.json({ error: "Sign in to upload a document." }, { status: 401 });

  const { data: property } = await supabase.from("properties").select("id").eq("id", parsed.data.propertyId).maybeSingle();
  if (!property) return NextResponse.json({ error: "Property not found." }, { status: 404 });

  const documentId = crypto.randomUUID();
  const year = new Date().getUTCFullYear();
  const extension = extensionByMimeType[parsed.data.mimeType];
  const storageKey = `${property.id}/${year}/${documentId}/original.${extension}`;
  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    property_id: property.id,
    document_type: parsed.data.documentType,
    original_filename: parsed.data.filename,
    mime_type: parsed.data.mimeType,
    byte_size: parsed.data.byteSize,
    storage_key: storageKey,
    sha256: parsed.data.sha256,
    status: "queued",
    uploaded_by: userId,
  });
  if (insertError) return NextResponse.json({ error: "Could not create the private document record." }, { status: 500 });

  const { data: upload, error: uploadError } = await supabase.storage.from("documents").createSignedUploadUrl(storageKey);
  if (uploadError) {
    await supabase.from("documents").delete().eq("id", documentId);
    return NextResponse.json({ error: "Could not prepare the private upload." }, { status: 500 });
  }

  return NextResponse.json({ documentId, storageKey, token: upload.token });
}
