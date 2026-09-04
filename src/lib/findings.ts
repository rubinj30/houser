import type { Finding, Priority, ReviewStatus, Severity } from "@/lib/types";

export const severityLabels: Record<Severity, string> = {
  maintenance_item: "Maintenance",
  recommendation: "Recommendation",
  safety_hazard: "Safety",
};

export const priorityLabels: Record<Priority, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  important: "Important",
  routine: "Routine",
  informational: "Info",
};

export type PrioritizedFinding = {
  finding: Finding;
  reason: "Overdue" | "Emergency" | "Safety" | "Urgent" | "Due soon" | "Important";
  targetDate: string | null;
};

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function getPrioritizedFindings(
  findings: Finding[],
  reviewStatuses: Record<string, ReviewStatus>,
  today: string,
  limit = 3,
): PrioritizedFinding[] {
  const dueSoonCutoff = addDays(today, 30);
  return findings
    .flatMap((finding) => {
      const status = reviewStatuses[finding.reportId] ?? "needs_review";
      if (status === "completed" || status === "not_applicable" || status === "deferred") return [];
      const overdueDate = finding.targetEndOn ?? finding.targetStartOn ?? null;
      const upcomingDate = finding.targetStartOn ?? finding.targetEndOn ?? null;
      const ranked = overdueDate && overdueDate < today
        ? { rank: 0, reason: "Overdue" as const, targetDate: overdueDate }
        : finding.priority === "emergency"
          ? { rank: 1, reason: "Emergency" as const, targetDate: upcomingDate }
          : finding.severity === "safety_hazard"
            ? { rank: 2, reason: "Safety" as const, targetDate: upcomingDate }
            : finding.priority === "urgent"
              ? { rank: 3, reason: "Urgent" as const, targetDate: upcomingDate }
              : upcomingDate && upcomingDate <= dueSoonCutoff
                ? { rank: 4, reason: "Due soon" as const, targetDate: upcomingDate }
                : finding.priority === "important"
                  ? { rank: 5, reason: "Important" as const, targetDate: upcomingDate }
                  : null;
      return ranked ? [{ finding, ...ranked }] : [];
    })
    .sort((a, b) => a.rank - b.rank || (a.targetDate ?? "9999-12-31").localeCompare(b.targetDate ?? "9999-12-31") || a.finding.title.localeCompare(b.finding.title))
    .slice(0, limit)
    .map(({ finding, reason, targetDate }) => ({ finding, reason, targetDate }));
}

export function countBySeverity(findings: Finding[]) {
  return findings.reduce<Record<Severity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1;
      return counts;
    },
    { maintenance_item: 0, recommendation: 0, safety_hazard: 0 },
  );
}

export function groupByCategory(findings: Finding[]) {
  return Object.entries(
    findings.reduce<Record<string, Finding[]>>((groups, finding) => {
      (groups[finding.category] ??= []).push(finding);
      return groups;
    }, {}),
  )
    .map(([category, items]) => ({
      category,
      count: items.length,
      urgent: items.filter((item) => item.priority === "emergency" || item.priority === "urgent").length,
    }))
    .sort((a, b) => b.urgent - a.urgent || b.count - a.count || a.category.localeCompare(b.category));
}

export function filterFindings(
  findings: Finding[],
  options: { query?: string; severity?: Severity | "all"; category?: string | "all" },
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  return findings.filter((finding) => {
    if (options.severity && options.severity !== "all" && finding.severity !== options.severity) return false;
    if (options.category && options.category !== "all" && finding.category !== options.category) return false;
    if (!query) return true;
    return [finding.title, finding.category, finding.area, finding.location, finding.suggestedAction]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

export function formatSourcePages(pages: number[]) {
  if (pages.length === 0) return "No page";
  if (pages.length === 1) return `Page ${pages[0]}`;
  return `Pages ${pages[0]}–${pages.at(-1)}`;
}

export function mergeFindings(preferred: Finding[], fallback: Finding[]) {
  const seen = new Set<string>();
  return [...preferred, ...fallback].filter((finding) => {
    const identity = finding.workItemId ?? finding.reportId;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
