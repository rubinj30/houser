import { describe, expect, it } from "vitest";
import fixture from "../../seed-data/sample-property-example-hvac-vendor-proposal.json";
import { normalizedDocumentSchema } from "./document-extraction";

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
});
