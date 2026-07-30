const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

// en-CA formats as YYYY-MM-DD, which happens to be exactly the sortable/
// comparable date-key format we want for grouping appointments by day.
const IST_DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
});

export function formatSlotRange(slotTime: string | null, durationMinutes: number) {
  if (!slotTime) return "Time TBD";
  const start = new Date(slotTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return `${IST_TIME_FORMATTER.format(start)} to ${IST_TIME_FORMATTER.format(end)} IST`;
}

export function istDateKey(slotTime: string) {
  return IST_DATE_KEY_FORMATTER.format(new Date(slotTime));
}

const IST_HOUR_MINUTE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Minutes since midnight IST, independent of the date — lets the Session
// Story table sort purely by time-of-day (e.g. group every 5pm slot
// together regardless of which day it falls on) separately from sorting
// by calendar date.
export function istMinutesOfDay(slotTime: string) {
  const parts = IST_HOUR_MINUTE_FORMATTER.formatToParts(new Date(slotTime));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
