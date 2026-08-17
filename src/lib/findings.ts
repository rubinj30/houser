import type { Finding, Priority, Severity } from "@/lib/types";

export const severityLabels: Record<Severity, string> = {
  maintenance_item: "Maintenance",
  recommendation: "Recommendation",
  safety_hazard: "Safety",
};

export const priorityLabels: Record<Priority, string> = {
  urgent: "Urgent",
  important: "Important",
  routine: "Routine",
  informational: "Info",
};

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
      urgent: items.filter((item) => item.priority === "urgent").length,
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
