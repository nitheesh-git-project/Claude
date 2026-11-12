import { describe, expect, it } from "vitest";
import { buildIcs, icsDataUrl, icsEscape, icsFold, icsUtc } from "./icsEvent";

const base = {
  uid: "appt-123@moverestore",
  start: "2026-10-28T12:30:00.000Z",
  durationMinutes: 60,
  title: "Physiotherapy video session",
  stamp: new Date("2026-10-27T05:00:00.000Z"),
};

describe("buildIcs", () => {
  it("writes the instant in UTC so every calendar agrees", () => {
    const ics = buildIcs(base)!;
    expect(ics).toContain("DTSTART:20261028T123000Z");
    expect(ics).toContain("DTEND:20261028T133000Z");
    expect(ics).toContain("DTSTAMP:20261027T050000Z");
  });

  it("is a well-formed single event with CRLF lines", () => {
    const ics = buildIcs(base)!;
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapes text values", () => {
    expect(icsEscape("a, b; c\\d\ne")).toBe("a\\, b\; c\\\\d\\ne");
    const ics = buildIcs({ ...base, description: "Link on Home, 15 min before;\nthen tap Join" })!;
    expect(ics).toContain("DESCRIPTION:Link on Home\\, 15 min before\;\\nthen tap Join");
  });

  it("cannot be given a line break through the uid", () => {
    const ics = buildIcs({ ...base, uid: "x\r\nEND:VCALENDAR" })!;
    expect(ics.match(/END:VCALENDAR/g)).toHaveLength(1);
  });

  it("returns null for a start it cannot read or an empty duration", () => {
    expect(buildIcs({ ...base, start: "nonsense" })).toBeNull();
    expect(buildIcs({ ...base, durationMinutes: 0 })).toBeNull();
  });
});

describe("icsFold", () => {
  it("leaves a short line alone and folds a long one at 75 octets", () => {
    expect(icsFold("SUMMARY:short")).toBe("SUMMARY:short");
    const folded = icsFold("DESCRIPTION:" + "x".repeat(200));
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lines.join("").replace(/ /g, "")).toBe("DESCRIPTION:" + "x".repeat(200));
  });

  it("does not split a multi-byte character", () => {
    const folded = icsFold("SUMMARY:" + "₹".repeat(60));
    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
  });
});

describe("icsUtc / icsDataUrl", () => {
  it("formats an instant", () => {
    expect(icsUtc(Date.parse("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });

  it("makes a downloadable data URL", () => {
    const url = icsDataUrl("BEGIN:VCALENDAR\r\n");
    expect(url.startsWith("data:text/calendar;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1])).toBe("BEGIN:VCALENDAR\r\n");
  });
});
