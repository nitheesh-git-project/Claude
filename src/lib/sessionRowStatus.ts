// The status word a session shows in the desktop sessions list's compact
// rows (SessionFilterList). The full card beside the list says it in its own
// words; this is the one-word version, so it has to agree with the card on
// the one fact both show: a no-show is not a completed session.

export type RowStatusTone = "info" | "brand" | "good" | "bad" | "warn" | "neutral";

export function sessionRowStatus(status: string, noShow?: boolean): { label: string; tone: RowStatusTone } {
  if (noShow) return { label: "No-show", tone: "warn" };
  switch (status) {
    case "requested":
      return { label: "Requested", tone: "warn" };
    case "confirmed":
      return { label: "Confirmed", tone: "brand" };
    case "completed":
      return { label: "Completed", tone: "good" };
    case "cancelled":
      return { label: "Cancelled", tone: "bad" };
    default:
      return { label: status ? status[0].toUpperCase() + status.slice(1).replace(/_/g, " ") : "Unknown", tone: "neutral" };
  }
}
