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
