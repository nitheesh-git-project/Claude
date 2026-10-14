/**
 * Which sessions are waiting on an admin to assign a therapist, and which
 * are only waiting on the patient to pay.
 *
 * "Sessions with no therapist" used to count every unassigned row that was
 * not cancelled. The online wizard creates its booking on the first Pay tap,
 * before any money moves, so every abandoned checkout sat in that queue
 * looking like work -- and assigning one reserved a therapist's hour for a
 * session nobody had paid for. A paid session assigns itself when the roster
 * has one clear answer (confirmPaidAppointment), so the admin's queue is the
 * committed sessions that could not: paid, on terms, drawn from a purchase,
 * or a home visit (cash at the door is a commitment too).
 *
 * An online, prepaid, unpaid session is "awaiting payment" instead: shown
 * apart, never urgent, and it moves into the queue by itself if it is paid
 * and the auto-assigner cannot pick.
 *
 * Dependency-free so the rule can be tested without a database.
 */

export type AssignQueueRow = {
  therapist_id: string | null;
  status: string;
  payment_status: string;
  payment_terms?: string | null;
  package_purchase_id?: string | null;
};

/** Unassigned, live, and only waiting on the patient to pay online. */
export function awaitsPatientPayment(row: AssignQueueRow, isHomeVisit: boolean): boolean {
  return (
    !row.therapist_id &&
    row.status !== "cancelled" &&
    row.status !== "completed" &&
    row.payment_status === "unpaid" &&
    (row.payment_terms ?? "prepaid") !== "pay_later" &&
    !row.package_purchase_id &&
    !isHomeVisit
  );
}

/** Unassigned, live, and committed -- an admin's to staff. */
export function needsTherapist(row: AssignQueueRow, isHomeVisit: boolean): boolean {
  return (
    !row.therapist_id && row.status !== "cancelled" && !awaitsPatientPayment(row, isHomeVisit)
  );
}

/**
 * Every programme session reaches a person. A session booked against a
 * programme -- by the patient, by accepting a therapist's suggestion, or a
 * visit on a home-visit programme -- lands here `requested` and unassigned
 * (bookPackageSession / bookHomeVisitSession no longer assign it), and the
 * admin assigns it. What makes that one tap rather than a search is the
 * pre-pick: the programme's own therapist, the purchase's
 * `locked_therapist_id`.
 *
 * Read from the purchase at render time, never copied onto the session: a
 * programme reassigned to someone else (/api/admin/reassign-*-therapist)
 * changes the pre-pick of every session still waiting, straight away.
 * Nothing is reserved for them while the session waits, so whether they are
 * still free is a separate question (`assignabilityFromRoster`), asked when
 * the queue renders and again, authoritatively, by the assign route.
 */
export type ProgrammeQueueRow = {
  therapist_id: string | null;
  status: string;
  package_purchase_id?: string | null;
  home_visit_purchase_id?: string | null;
};

export type ProgrammeLocks = {
  /** patient_package_purchases.id -> locked_therapist_id */
  packagePurchases: ReadonlyMap<string, string | null>;
  /** home_visit_package_purchases.id -> locked_therapist_id */
  homeVisitPurchases: ReadonlyMap<string, string | null>;
};

/** The therapist to pre-pick for an unassigned programme session, or null. */
export function programmeTherapistFor(row: ProgrammeQueueRow, locks: ProgrammeLocks): string | null {
  if (row.therapist_id || row.status !== "requested") return null;
  if (row.package_purchase_id) {
    const locked = locks.packagePurchases.get(row.package_purchase_id);
    if (locked) return locked;
  }
  if (row.home_visit_purchase_id) {
    const locked = locks.homeVisitPurchases.get(row.home_visit_purchase_id);
    if (locked) return locked;
  }
  return null;
}

/**
 * What the queue row and the session drawer carry for a pre-picked session:
 * who, and -- when they can no longer be assigned at that time -- why not,
 * in the "Unable to assign" dialog's own sentences. An empty `blocks` means
 * the one-tap "Assign <name>" is offered; anything in it replaces that with
 * "<name> is no longer free at this time".
 */
export type ProgrammePick = {
  therapistId: string;
  therapistName: string;
  blocks: string[];
};

/** "<name> is no longer free at this time - pick someone else or move it." */
export function programmePickWarning(pick: ProgrammePick): string | null {
  if (pick.blocks.length === 0) return null;
  return `${pick.therapistName} is no longer free at this time - pick someone else or move it.`;
}
