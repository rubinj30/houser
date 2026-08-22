import { describe, expect, it } from "vitest";
import { inspectionExtractionSchema } from "./inspection-extraction";

const validExtraction = {
  schemaVersion: 1,
  report: { propertyAddress: "123 Example Street", inspectionDate: "2024-01-01", inspectorCompany: null, pageCount: 58, summary: "Inspection" },
  findings: [{ sourceSection: "5.1.4", title: "Terminate loose wiring", category: "Electrical", area: "Kitchen", location: "Under kitchen sink", workType: "repair", severity: "safety_hazard", priority: "urgent", recommendation: "Use a proper junction box.", sourcePages: [17], sourceExcerpt: "Loose wiring was observed.", confidence: 0.99 }],
  reviewWarnings: [],
} as const;

describe("inspectionExtractionSchema", () => {
  it("accepts a fully sourced finding", () => {
    expect(inspectionExtractionSchema.parse(validExtraction).findings[0].sourceSection).toBe("5.1.4");
  });

  it("rejects duplicate report sections", () => {
    expect(() => inspectionExtractionSchema.parse({ ...validExtraction, findings: [...validExtraction.findings, validExtraction.findings[0]] })).toThrow(/Duplicate source section/);
  });

  it("rejects page references beyond the report", () => {
    expect(() => inspectionExtractionSchema.parse({ ...validExtraction, findings: [{ ...validExtraction.findings[0], sourcePages: [59] }] })).toThrow(/exceeds report length/);
  });
});
