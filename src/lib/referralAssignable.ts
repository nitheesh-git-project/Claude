// Which hospital referrals can still be given a therapist and a time: the
// two states before an invite goes out. One list for the admin screen (show
// the form or not), the assign route (refuse early, in words) and the
// claim function's expected statuses, so they cannot disagree.
//
// A declined referral showed the assign form like any other referral with
// nobody on it; the database then refused the claim with "someone else sent
// an invite or declined it", which read as a race rather than as "this
// referral was declined". Dependency-free.

export const REFERRAL_ASSIGNABLE_STATUSES = ["pending_review", "therapist_assigned"] as const;

export function referralIsAssignable(status: string | null | undefined): boolean {
  return (REFERRAL_ASSIGNABLE_STATUSES as readonly string[]).includes(status ?? "");
}

/** Why it cannot be assigned, for the route's 409 and the screen. */
export function referralNotAssignableMessage(status: string | null | undefined): string {
  if (status === "declined") return "This referral was declined, so it can't be assigned. The hospital can refer the patient again.";
  if (status === "converted") return "This patient has already booked through their invite, so there's nothing left to assign.";
  if (status === "invite_sent") return "An invite has already gone to this patient. Change the time from the session once they book.";
  return "This referral can't be assigned in its current state. Refresh to see where it stands.";
}
