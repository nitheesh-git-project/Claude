// The time beside an activity-feed item: "just now", "5m ago", "3h ago",
// "2d ago", then the date. Dependency-free, unit-tested.
//
// A time in the future is never "just now". The feeds dated upcoming
// bookings by their slot time, minutes-ago came out negative, negative is
// under one, and every booking read "just now" until its session had
// happened. Bookings are dated by when they were made now; this is the
// second lock -- a future time prints its date.

export function feedTimeLabel(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const dateLabel = new Date(then).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
  const mins = Math.round((nowMs - then) / 60_000);
  // A minute of clock skew between server and browser is still "just now".
  if (mins < -1) return dateLabel;
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return dateLabel;
}
