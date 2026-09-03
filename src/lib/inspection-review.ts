import type { Finding, ReviewStatus } from "@/lib/types";

export type InspectionReviewProgress = {
  total: number;
  reviewed: number;
  remaining: number;
  percent: number;
  nextFinding: Finding | null;
};

export function getInspectionReviewProgress(
  findings: Finding[],
  reviewStatuses: Record<string, ReviewStatus>,
): InspectionReviewProgress {
  const inspectionFindings = findings.filter((finding) => finding.isInspectionFinding);
  const pending = inspectionFindings.filter(
    (finding) => (reviewStatuses[finding.reportId] ?? "needs_review") === "needs_review",
  );
  const total = inspectionFindings.length;
  const remaining = pending.length;
  const reviewed = total - remaining;

  return {
    total,
    reviewed,
    remaining,
    percent: total === 0 ? 0 : Math.round((reviewed / total) * 100),
    nextFinding: pending[0] ?? null,
  };
}
