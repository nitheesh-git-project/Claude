export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  therapist_assigned: "Therapist Assigned",
  invite_sent: "Invite Sent",
  converted: "Registered",
  declined: "Declined",
};

export function formatReferralStatus(status: string) {
  return REFERRAL_STATUS_LABELS[status] ?? status;
}
