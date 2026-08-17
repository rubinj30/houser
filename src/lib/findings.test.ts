import { describe, expect, it } from "vitest";
import inspectionSeed from "../../seed-data/sample-property-inspection.json";
import { countBySeverity, filterFindings, formatSourcePages, groupByCategory } from "./findings";
import type { Finding } from "./types";

const findings = inspectionSeed.findings as Finding[];

describe("Sample Home inspection fixture", () => {
  it("matches the source summary counts", () => {
    expect(findings).toHaveLength(51);
    expect(countBySeverity(findings)).toEqual({ maintenance_item: 3, recommendation: 40, safety_hazard: 8 });
  });

  it("groups findings by category with safety counts", () => {
    expect(groupByCategory(findings).find((item) => item.category === "Electrical")).toMatchObject({ count: 7, urgent: 3 });
  });

  it("searches across location and action text", () => {
    expect(filterFindings(findings, { query: "chimney", severity: "all", category: "all" })).toHaveLength(2);
    expect(filterFindings(findings, { query: "GFCI", severity: "all", category: "all" })[0]?.reportId).toBe("5.4.1");
  });

  it("formats single and multi-page evidence", () => {
    expect(formatSourcePages([17])).toBe("Page 17");
    expect(formatSourcePages([38, 39])).toBe("Pages 38–39");
  });
});
