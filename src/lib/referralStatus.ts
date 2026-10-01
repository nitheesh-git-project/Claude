export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  therapist_assigned: "Therapist Assigned",
  // "Registration link sent", not "Invite Sent". A patient inviting a friend
  // is a different feature with its own screens (see inviteRewards.ts), and
  // one back office cannot have two things called an invite -- this one is
  // specifically the link a hospital-referred patient registers with.
  invite_sent: "Registration Link Sent",
  converted: "Registered",
  declined: "Declined",
};

export function formatReferralStatus(status: string) {
  return REFERRAL_STATUS_LABELS[status] ?? status;
}

/**
 * The referral lifecycle, named once.
 *
 * `patient_referrals.status` is CHECKed to exactly five values, and the
 * hospital's own dashboard was filtering for `"pending"` and `"accepted"` --
 * neither of which the column can ever hold. So "Referrals with the clinic"
 * and "Accepted" read **0 for every partner, permanently**, on the screen a
 * partner opens to see what happened to the patients they sent. It looked
 * like a clinic that never actioned anything.
 *
 * That is what a state machine spread across screens costs. The five values
 * live in one place with the labels, and the groupings below are what a
 * screen should ask rather than comparing strings itself -- a status added
 * tomorrow is then a compile error in one file instead of a silent zero in
 * three.
 */
export const REFERRAL_STATUSES = [
  "pending_review",
  "therapist_assigned",
  "invite_sent",
  "converted",
  "declined",
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Still waiting on somebody at the clinic. */
export function isReferralWithClinic(status: string): boolean {
  return status === "pending_review" || status === "therapist_assigned";
}

/**
 * The clinic took this patient on -- a therapist was assigned, a link went
 * out, or they registered. Deliberately includes `therapist_assigned`: from
 * the partner's side, the moment a clinician is on it is the moment it was
 * accepted, and waiting for the patient to register is not the partner's
 * business.
 */
export function isReferralAccepted(status: string): boolean {
  return (
    status === "therapist_assigned" ||
    status === "invite_sent" ||
    status === "converted"
  );
}

/** Nothing further will happen without a new referral. */
export function isReferralClosed(status: string): boolean {
  return status === "converted" || status === "declined";
}

/** The partner can still withdraw it -- nobody has been sent a link. */
export function isReferralWithdrawable(status: string): boolean {
  return status === "pending_review" || status === "therapist_assigned";
}
