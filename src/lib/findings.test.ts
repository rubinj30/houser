import { describe, expect, it } from "vitest";
import { countBySeverity, filterFindings, formatSourcePages, groupByCategory, mergeFindings } from "./findings";
import type { Finding } from "./types";

const makeFinding = (overrides: Partial<Finding>): Finding => ({
  reportId: "sample-1",
  title: "Inspect sample component",
  category: "Exterior",
  area: "Outside",
  workType: "Inspection",
  severity: "recommendation",
  priority: "important",
  location: "Sample location",
  suggestedAction: "Have a qualified professional inspect the component.",
  sourcePages: [12],
  ...overrides,
});

const findings: Finding[] = [
  makeFinding({ reportId: "sample-1", title: "Inspect chimney cap", location: "Roof chimney" }),
  makeFinding({ reportId: "sample-2", title: "Seal chimney flashing", location: "Roof chimney", priority: "urgent", severity: "safety_hazard" }),
  makeFinding({ reportId: "sample-3", title: "Add GFCI protection", category: "Electrical", area: "Garage", location: "Garage outlet", priority: "urgent", severity: "safety_hazard" }),
  makeFinding({ reportId: "sample-4", title: "Clean gutters", category: "Roof", severity: "maintenance_item", priority: "routine" }),
];

describe("finding helpers", () => {
  it("counts findings by severity", () => {
    expect(countBySeverity(findings)).toEqual({ maintenance_item: 1, recommendation: 1, safety_hazard: 2 });
  });

  it("groups findings by category with safety counts", () => {
    expect(groupByCategory(findings).find((item) => item.category === "Electrical")).toMatchObject({ count: 1, urgent: 1 });
  });

  it("searches across location and action text", () => {
    expect(filterFindings(findings, { query: "chimney", severity: "all", category: "all" })).toHaveLength(2);
    expect(filterFindings(findings, { query: "GFCI", severity: "all", category: "all" })[0]?.reportId).toBe("sample-3");
  });

  it("formats single and multi-page evidence", () => {
    expect(formatSourcePages([17])).toBe("Page 17");
    expect(formatSourcePages([38, 39])).toBe("Pages 38–39");
  });

  it("deduplicates a newly created item when refreshed server data arrives", () => {
    const persisted = findings[0];
    const local = { ...persisted, workItemId: "work-1", isLocal: true };
    const refreshed = { ...persisted, workItemId: "work-1" };

    expect(mergeFindings([local], [refreshed])).toEqual([local]);
  });
});
