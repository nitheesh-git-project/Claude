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

/**
 * What a programme session says to the patient between being booked and
 * being staffed. Every programme session -- one the patient booked against
 * their credits, one a therapist suggested and they accepted, a home visit
 * on a visit programme -- lands in the admin's "Sessions with no therapist"
 * queue with the programme's therapist pre-picked, and only an admin's
 * assign confirms it (docs/rules/programmes.md). "Requested" read as though
 * the patient had asked for something that might be refused; the session is
 * paid for and booked, and the one thing outstanding is the clinic's.
 */
export const PROGRAMME_BOOKED_LABEL = "Booked - confirming your therapist";

export type PatientSessionStatusInput = {
  status: string;
  no_show?: boolean | null;
  therapist_id?: string | null;
  package_purchase_id?: string | null;
  home_visit_purchase_id?: string | null;
};

/** Drawn from a purchase, still `requested`, and nobody on it yet. */
export function isBookedAwaitingTherapist(a: PatientSessionStatusInput): boolean {
  return (
    a.status === "requested" &&
    !a.no_show &&
    !a.therapist_id &&
    Boolean(a.package_purchase_id || a.home_visit_purchase_id)
  );
}

/**
 * The patient's status word for a session: `sessionRowStatus`, except that a
 * programme session waiting on the clinic's assign says so rather than
 * "Requested". A single consultation keeps "Requested" -- it is not paid
 * from a programme, and it may still be waiting on the patient's payment.
 */
export function patientSessionStatus(a: PatientSessionStatusInput): { label: string; tone: RowStatusTone } {
  if (isBookedAwaitingTherapist(a)) return { label: PROGRAMME_BOOKED_LABEL, tone: "info" };
  return sessionRowStatus(a.status, a.no_show ?? false);
}
