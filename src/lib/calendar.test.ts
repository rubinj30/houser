import { describe, expect, it } from "vitest";
import type { Finding } from "./types";
import { buildGoogleCalendarUrl, buildIcsCalendar, calendarFilename } from "./calendar";

const item: Finding = {
  workItemId: "work-123",
  reportId: "service:work-123",
  title: "Service HVAC, filters & drains",
  category: "HVAC",
  area: "Upstairs",
  workType: "maintain",
  severity: "maintenance_item",
  priority: "routine",
  location: "Upstairs",
  suggestedAction: "Service the system; replace filters.",
  sourcePages: [],
  targetStartOn: "2026-09-10",
  targetEndOn: "2026-09-12",
};

const property = { displayName: "Sample Home", address: "123 Example Street, Atlanta, GA" };

describe("calendar export", () => {
  it("builds a prefilled all-day Google Calendar range", () => {
    const url = new URL(buildGoogleCalendarUrl(item, property, "https://houser.example/"));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20260910/20260913");
    expect(url.searchParams.get("text")).toBe("Houser: Service HVAC, filters & drains");
  });

  it("creates a portable ICS event with escaped content and stable identity", () => {
    const ics = buildIcsCalendar(item, property, "https://houser.example/");
    expect(ics).toContain("UID:houser-work-123@houser.local");
    expect(ics).toContain("DTEND;VALUE=DATE:20260913");
    expect(ics).toContain("SUMMARY:Houser: Service HVAC\\, filters & drains");
    expect(ics).toContain("Service the system\\; replace filters.");
  });

  it("uses a filesystem-friendly filename", () => {
    expect(calendarFilename(item)).toBe("service-hvac-filters-drains.ics");
  });
});
