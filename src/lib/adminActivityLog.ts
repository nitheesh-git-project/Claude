import type { SupabaseClient } from "@supabase/supabase-js";

// Who did what, from the admin dashboard. Before this, the only two audit
// trails in the whole schema were appointment_reassignment_log and
// condition_access_grants.decided_by -- which meant a refund, a payout
// settlement or a cash-remittance confirmation was unattributable the moment
// more than one person had admin access.
//
// Deliberately append-only and best-effort: `record` never throws and never
// blocks the action it describes. An audit write failing is worth knowing
// about in the server log, but refusing to refund a patient because the
// logging table is unhappy is the worse outcome. Same posture as the
// Google Calendar sync rule in AGENTS.md.

export type AdminActivityAction =
  // approvals / accounts
  | "account.approve"
  | "account.decline"
  | "account.create"
  | "account.set_active"
  | "account.reset_password"
  | "profile_change.approve"
  | "profile_change.decline"
  // sessions
  | "session.create"
  | "session.assign"
  | "session.update"
  | "session.cancel"
  | "session.reopen"
  | "session.restore"
  | "session.mark_paid_cash"
  // money
  | "payout.settle"
  | "payout_request.start_review"
  | "payout_request.complete"
  | "refund.issue"
  | "refund.partial"
  | "cash.mark_remitted"
  | "cash.mark_refund_returned"
  // partners
  | "hospital.onboard"
  | "hospital.set_active"
  | "hospital.set_revenue_share"
  | "referral.assign"
  | "referral.decline"
  // configuration
  | "setting.update"
  | "catalog.create"
  | "catalog.update"
  | "catalog.delete"
  | "admin.set_scope";

export type AdminActivityEntry = {
  action: AdminActivityAction;
  /** The row this acted on, when there is one (appointment id, profile id, purchase id). */
  targetId?: string | null;
  /** Human-readable subject, resolved at write time so the log stays readable
   *  even after the underlying row is renamed or deleted. */
  targetLabel?: string | null;
  /** Money moved by this action, in paise, when any did. Stored separately
   *  from `details` so the log can be filtered to "everything that moved
   *  money" without parsing JSON. */
  amountPaise?: number | null;
  /** Anything else worth keeping: the before/after of an edit, a refund
   *  reason, a rejected value. Never secrets. */
  details?: Record<string, unknown> | null;
};

export async function recordAdminActivity(
  admin: SupabaseClient,
  actorId: string,
  entry: AdminActivityEntry
): Promise<void> {
  try {
    const { error } = await admin.from("admin_activity_log").insert({
      actor_id: actorId,
      action: entry.action,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      amount_paise: entry.amountPaise ?? null,
      details: entry.details ?? null,
    });
    if (error) {
      console.error("admin activity log write failed", entry.action, error.message);
    }
  } catch (err) {
    console.error("admin activity log write threw", entry.action, err);
  }
}

// Labels for the Activity Log screen. Kept beside the action union so a new
// action can't be added without deciding how it reads to a human.
export const ADMIN_ACTIVITY_LABELS: Record<AdminActivityAction, string> = {
  "account.approve": "Approved account",
  "account.decline": "Declined account",
  "account.create": "Created account",
  "account.set_active": "Changed account status",
  "account.reset_password": "Reset password",
  "profile_change.approve": "Approved profile change",
  "profile_change.decline": "Declined profile change",
  "session.create": "Created booking",
  "session.assign": "Assigned therapist",
  "session.update": "Edited session",
  "session.cancel": "Cancelled session",
  "session.reopen": "Reopened session",
  "session.restore": "Restored session",
  "session.mark_paid_cash": "Marked paid by cash",
  "payout.settle": "Settled payout",
  "payout_request.start_review": "Started payout review",
  "payout_request.complete": "Completed payout request",
  "refund.issue": "Issued refund",
  "refund.partial": "Issued partial refund",
  "cash.mark_remitted": "Marked cash remitted",
  "cash.mark_refund_returned": "Marked cash refund returned",
  "hospital.onboard": "Onboarded hospital",
  "hospital.set_active": "Changed hospital status",
  "hospital.set_revenue_share": "Changed hospital revenue share",
  "referral.assign": "Assigned referral",
  "referral.decline": "Declined referral",
  "setting.update": "Changed a setting",
  "catalog.create": "Created catalog item",
  "catalog.update": "Edited catalog item",
  "catalog.delete": "Deleted catalog item",
  "admin.set_scope": "Changed admin access",
};

// Which actions moved money -- drives the Activity Log's "money only"
// filter. Derived from the action name rather than a second hand-kept list.
export function isMoneyAction(action: string): boolean {
  return (
    action.startsWith("payout") ||
    action.startsWith("refund") ||
    action.startsWith("cash.") ||
    action === "session.mark_paid_cash" ||
    action === "hospital.set_revenue_share"
  );
}
