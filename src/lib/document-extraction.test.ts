import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import fixture from "../../seed-data/sample-property-example-hvac-vendor-proposal.json";
import { buildDocumentExtractionPrompt, normalizedDocumentSchema } from "./document-extraction";

describe("normalized document extraction", () => {
  it("validates the Example HVAC Vendor proposal fixture", () => {
    const parsed = normalizedDocumentSchema.parse(fixture);
    expect(parsed.document.type).toBe("proposal");
    expect(parsed.financials.total.amountMinor).toBe(900000);
    expect(parsed.scopeItems).toHaveLength(8);
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
