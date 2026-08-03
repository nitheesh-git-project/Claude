// Every account is created and managed by an India-based admin team, so
// "when was this account created" is always answered in IST regardless of
// the browser's local timezone — matches formatSlotTime's reasoning for
// always showing a fixed, unambiguous zone rather than the viewer's own.
const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatIST(iso: string) {
  return `${IST_FORMATTER.format(new Date(iso))} IST`;
}
