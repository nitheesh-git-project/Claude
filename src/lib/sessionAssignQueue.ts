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
