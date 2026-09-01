import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { buildDocumentExtractionPrompt, normalizedDocumentSchema } from "./document-extraction";

const evidence = { pages: [1], excerpt: "Synthetic test evidence" };
const missingString = { value: null, confidence: 0, evidence: null };
const missingMoney = { amountMinor: null, currency: "USD", confidence: 0, evidence: null };
const fixture = {
  schemaVersion: 1,
  document: {
    type: "proposal",
    title: "Sample HVAC proposal",
    sourceFile: {
      originalFilename: "sample-hvac-proposal.pdf",
      privateObjectKey: "sample-property/sample-document/original.pdf",
      sha256: "a".repeat(64),
      pageCount: 2,
    },
    issuedOn: { value: "2026-01-15", confidence: 1, evidence },
    expiresOn: missingString,
    externalReference: missingString,
    acceptanceStatus: "proposed",
    summary: "Synthetic proposal for replacing residential HVAC equipment.",
  },
  propertyMatch: { propertyKey: null, address: missingString, confidence: 0 },
  vendor: {
    name: { value: "Example HVAC Company", confidence: 1, evidence },
    representativeName: missingString,
    representativeEmail: missingString,
    representativePhone: missingString,
  },
  financials: {
    subtotal: missingMoney,
    discountTotal: missingMoney,
    taxTotal: missingMoney,
    total: { amountMinor: 900000, currency: "USD", confidence: 1, evidence },
    paymentSchedule: [],
  },
  scopeItems: [
    {
      key: "replace-hvac",
      kind: "equipment",
      description: "Replace HVAC equipment",
      quantity: 1,
      amount: { amountMinor: 900000, currency: "USD", confidence: 1, evidence },
      category: "HVAC",
      area: "Main level",
      assetMatchKey: null,
      specifications: [],
      evidence,
    },
  ],
  terms: [
    { kind: "warranty", summary: "Example limited warranty", normalizedValue: null, evidence },
    { kind: "exclusion", summary: "Example excluded work", normalizedValue: null, evidence },
  ],
  proposedRecords: {
    vendor: true,
    workItems: [{ title: "Replace HVAC equipment", category: "HVAC", area: "Main level", workType: "Replacement", status: "inbox", estimatedCostMinor: 900000, sourcePages: [1] }],
    assets: [],
  },
  review: { required: true, warnings: [], unresolvedFields: ["financials.subtotal"] },
};

describe("normalized document extraction", () => {
  it("validates a synthetic proposal fixture", () => {
    const parsed = normalizedDocumentSchema.parse(fixture);
    expect(parsed.document.type).toBe("proposal");
    expect(parsed.financials.total.amountMinor).toBe(900000);
    expect(parsed.scopeItems).toHaveLength(1);
  });

  it("retains evidence for extracted terms and scope", () => {
    const parsed = normalizedDocumentSchema.parse(fixture);
    expect(parsed.scopeItems.every((item) => item.evidence.pages.length > 0)).toBe(true);
    expect(parsed.terms.some((term) => term.kind === "warranty")).toBe(true);
    expect(parsed.terms.some((term) => term.kind === "exclusion")).toBe(true);
  });

  it("requires human review and records ambiguity", () => {
    const parsed = normalizedDocumentSchema.parse(fixture);
    expect(parsed.review.required).toBe(true);
    expect(parsed.review.unresolvedFields).toContain("financials.subtotal");
    expect(parsed.document.acceptanceStatus).toBe("proposed");
  });

  it("gives quotes and invoices different extraction semantics", () => {
    const common = { originalFilename: "source.pdf", privateObjectKey: "property/document/original.pdf", sha256: "a".repeat(64) };
    expect(buildDocumentExtractionPrompt({ ...common, documentType: "quote" })).toContain("proposed, not completed");
    expect(buildDocumentExtractionPrompt({ ...common, documentType: "invoice" })).toContain("performed or billed");
    expect(buildDocumentExtractionPrompt({ ...common, documentType: "receipt" })).toContain("paid amount");
  });

  it("can be converted to an OpenAI structured-output format", () => {
    expect(() => zodTextFormat(normalizedDocumentSchema, "normalized_document")).not.toThrow();
  });
});
