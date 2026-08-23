import type { Finding } from "@/lib/types";

export type CalendarProperty = {
  displayName: string;
  address: string;
};

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function calendarDates(item: Finding) {
  if (!item.targetStartOn) throw new Error("A scheduled date is required to create a calendar event.");
  const inclusiveEnd = item.targetEndOn && item.targetEndOn >= item.targetStartOn ? item.targetEndOn : item.targetStartOn;
  return {
    start: compactDate(item.targetStartOn),
    exclusiveEnd: compactDate(addOneDay(inclusiveEnd)),
  };
}

function calendarDescription(item: Finding, property: CalendarProperty, houserUrl: string) {
  return [
    item.suggestedAction,
    "",
    `${property.displayName} · ${item.category} · ${item.area}`,
    `View in Houser: ${houserUrl}`,
  ].join("\n");
}

export function buildGoogleCalendarUrl(item: Finding, property: CalendarProperty, houserUrl: string) {
  const dates = calendarDates(item);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Houser: ${item.title}`,
    dates: `${dates.start}/${dates.exclusiveEnd}`,
    details: calendarDescription(item, property, houserUrl),
    location: property.address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

export function buildIcsCalendar(item: Finding, property: CalendarProperty, houserUrl: string) {
  const dates = calendarDates(item);
  const uidSource = item.workItemId ?? item.reportId;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Houser//Property Maintenance//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(`houser-${uidSource}@houser.local`)}`,
    "DTSTAMP:20000101T000000Z",
    `DTSTART;VALUE=DATE:${dates.start}`,
    `DTEND;VALUE=DATE:${dates.exclusiveEnd}`,
    `SUMMARY:${escapeIcs(`Houser: ${item.title}`)}`,
    `DESCRIPTION:${escapeIcs(calendarDescription(item, property, houserUrl))}`,
    `LOCATION:${escapeIcs(property.address)}`,
    `URL:${escapeIcs(houserUrl)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function calendarFilename(item: Finding) {
  const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "houser-work"}.ics`;
}
