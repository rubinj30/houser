import { z } from "zod";

const evidenceSchema = z.object({
  pages: z.array(z.number().int().positive()).min(1),
  excerpt: z.string().min(1),
});

const extractedStringSchema = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: evidenceSchema.nullable(),
});

const extractedMoneySchema = z.object({
  amountMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).default("USD"),
  confidence: z.number().min(0).max(1),
  evidence: evidenceSchema.nullable(),
});

const termSchema = z.object({
  kind: z.enum(["payment", "warranty", "expiration", "exclusion", "condition", "other"]),
  summary: z.string().min(1),
  normalizedValue: z.string().nullable().default(null),
  evidence: evidenceSchema,
});

export const normalizedDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  document: z.object({
    type: z.enum(["proposal", "estimate", "invoice", "receipt", "work_order", "warranty", "permit", "manual", "other"]),
    title: z.string().min(1),
    sourceFile: z.object({
      originalFilename: z.string().min(1),
      privateObjectKey: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      pageCount: z.number().int().positive(),
    }),
    issuedOn: extractedStringSchema,
    expiresOn: extractedStringSchema,
    externalReference: extractedStringSchema,
    acceptanceStatus: z.enum(["draft", "proposed", "accepted", "declined", "completed", "unknown"]),
    summary: z.string().min(1),
  }),
  propertyMatch: z.object({
    propertyKey: z.string().nullable(),
    address: extractedStringSchema,
    confidence: z.number().min(0).max(1),
  }),
  vendor: z.object({
    name: extractedStringSchema,
    representativeName: extractedStringSchema,
    representativeEmail: extractedStringSchema,
    representativePhone: extractedStringSchema,
  }),
  financials: z.object({
    subtotal: extractedMoneySchema,
    discountTotal: extractedMoneySchema,
    taxTotal: extractedMoneySchema,
    total: extractedMoneySchema,
    paymentSchedule: z.array(termSchema),
  }),
  scopeItems: z.array(z.object({
    key: z.string().min(1),
    kind: z.enum(["equipment", "labor", "material", "service", "discount", "fee", "other"]),
    description: z.string().min(1),
    quantity: z.number().positive().nullable(),
    amount: extractedMoneySchema.nullable(),
    category: z.string().nullable(),
    area: z.string().nullable(),
    assetMatchKey: z.string().nullable(),
    specifications: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    evidence: evidenceSchema,
  })).min(1),
  terms: z.array(termSchema),
  proposedRecords: z.object({
    vendor: z.boolean(),
    workItems: z.array(z.object({
      title: z.string().min(1),
      category: z.string().min(1),
      area: z.string().nullable(),
      workType: z.string().min(1),
      status: z.literal("inbox"),
      estimatedCostMinor: z.number().int().nonnegative().nullable(),
      sourcePages: z.array(z.number().int().positive()).min(1),
    })),
    assets: z.array(z.object({
      name: z.string().min(1),
      category: z.string().min(1),
      assetType: z.string().min(1),
      manufacturer: z.string().nullable(),
      model: z.string().nullable(),
      status: z.enum(["proposed", "installed", "unknown"]),
      sourcePages: z.array(z.number().int().positive()).min(1),
    })),
  }),
  review: z.object({
    required: z.literal(true),
    warnings: z.array(z.string()),
    unresolvedFields: z.array(z.string()),
  }),
});

export type NormalizedDocument = z.infer<typeof normalizedDocumentSchema>;
