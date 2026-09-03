import { describe, expect, it } from "vitest";
import type { Finding, ReviewStatus } from "@/lib/types";
import { getInspectionReviewProgress } from "./inspection-review";

function finding(reportId: string, isInspectionFinding: boolean): Finding {
  return {
    reportId,
    title: reportId,
    category: "General",
    area: "General",
    workType: "other",
    severity: "recommendation",
    priority: "routine",
    location: "General",
    suggestedAction: "Review",
    sourcePages: [],
    isInspectionFinding,
  };
}

describe("inspection review progress", () => {
  it("counts only inspection findings and identifies the next pending finding", () => {
    const findings = [finding("reviewed", true), finding("next", true), finding("quote", false)];
    const statuses: Record<string, ReviewStatus> = { reviewed: "open", next: "needs_review", quote: "needs_review" };

    expect(getInspectionReviewProgress(findings, statuses)).toEqual({
      total: 2,
      reviewed: 1,
      remaining: 1,
      percent: 50,
      nextFinding: findings[1],
    });
  });

  it("treats a missing status as pending and avoids a fake percentage without an inspection", () => {
    expect(getInspectionReviewProgress([finding("manual", false)], {})).toEqual({
      total: 0,
      reviewed: 0,
      remaining: 0,
      percent: 0,
      nextFinding: null,
    });
  });
});
