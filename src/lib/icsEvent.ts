// A one-event calendar file (RFC 5545), for "Add to calendar".
//
// The booking confirmation offers this so a requested session lands in the
// patient's own calendar the moment they book. It is built in the browser and
// handed over as a data URL, so there is no route and nothing stored.
//
// Dependency-free. The text rules that matter and are easy to get wrong:
//   - times are written in UTC (`...Z`), so the file means the same instant in
//     every calendar app whatever zone the phone is in;
//   - TEXT values escape backslash, semicolon, comma and newline;
//   - lines end in CRLF and are folded at 75 octets.

export type IcsEventInput = {
  /** Stable id, so adding the same file twice updates rather than duplicates. */
  uid: string;
  start: string | number | Date;
  durationMinutes: number;
  title: string;
  description?: string;
  /** The moment the file is made; injectable so it is testable. */
  stamp?: Date;
};

function toMs(value: string | number | Date): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime();
}

/** 20261028T123000Z */
export function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold a content line at 75 octets (counting UTF-8 bytes), continuing with a
 *  single space, without splitting a multi-byte character. */
export function icsFold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > limit) {
      out.push(current);
      current = " ";
      size = 1;
      limit = 75;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n");
}

/** The calendar file's text, or null when the start cannot be read. */
export function buildIcs(input: IcsEventInput): string | null {
  const startMs = toMs(input.start);
  if (!Number.isFinite(startMs) || !(input.durationMinutes > 0)) return null;
  const endMs = startMs + input.durationMinutes * 60_000;
  const stamp = (input.stamp ?? new Date()).getTime();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MoveRestore//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid.replace(/[^A-Za-z0-9@._-]/g, "")}`,
    `DTSTAMP:${icsUtc(stamp)}`,
    `DTSTART:${icsUtc(startMs)}`,
    `DTEND:${icsUtc(endMs)}`,
    `SUMMARY:${icsEscape(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${icsEscape(input.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/** The href for a download link: `<a href=... download="session.ics">`. */
export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
