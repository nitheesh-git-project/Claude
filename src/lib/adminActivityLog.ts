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
  // A recommendation is the only route to a programme, so withdrawing one
  // stops a purchase from happening -- worth the same trail as cancelling
  // a session.
  | "payment.goodwill_discount"
  | "care_plan.approve"
  | "care_plan.reject"
  | "care_plan.edit_and_approve"
  | "care_plan.withdraw"
  // Typed by an admin, attributed to the clinician whose judgement it is.
  | "care_plan.author_on_behalf"
  | "session.restore"
  | "session.mark_paid_cash"
  // purchases (a programme, not one session)
  // The admin override lane -- putting credits into an account, taking a
  // wrongly-spent one back, reopening a lapsed package. Each one moves what
  // a patient can book, so isMoneyAction counts all three.
  | "credits.grant"
  | "credits.reverse"
  | "credits.revive"
  | "package.extend_expiry"
  | "package.reassign_therapist"
  // money
  | "payout.settle"
  | "payout_request.start_review"
  | "payout_request.complete"
  | "refund.issue"
  | "refund.partial"
  // The therapist's own route no longer accepts an amount, so this is the
  // only way a collected figure ever changes after the fact -- and it is a
  // money move in its own right, since what a therapist owes the clinic is
  // computed from it.
  | "cash.correct_amount"
  | "cash.mark_remitted"
  | "cash.mark_refund_returned"
  | "expense.create"
  | "expense.delete"
  // A campaign an admin sets up decides what every patient who types its
  // name pays, so creating or re-pricing one moves more money than most
  // single refunds do -- see isMoneyAction, which counts all three.
  | "promo.create"
  | "promo.update"
  | "promo.delete"
  // Every future payout for this therapist is computed from this
  // percentage, so changing it moves more money than most single refunds
  // do -- see isMoneyAction, which counts it as one.
  | "therapist.set_revenue_share"
  // Roster. A weekly schedule decides who the clinic can offer and when, and
  // leave takes somebody off the board entirely -- both were unattributable
  // before the roster redesign, on a screen every admin with the sessions
  // scope can reach.
  | "therapist.set_weekly_schedule"
  | "therapist.set_schedule_exception"
  | "therapist.clear_schedule_exception"
  | "therapist.set_leave"
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
  "payment.goodwill_discount": "Took an amount off a session as goodwill",
  "care_plan.approve": "Approved a recommendation",
  "care_plan.reject": "Turned down a recommendation",
  "care_plan.edit_and_approve": "Approved a recommendation with different numbers",
  "care_plan.withdraw": "Withdrew a recommendation",
  "care_plan.author_on_behalf": "Wrote a recommendation on a therapist's behalf",
  "session.reopen": "Reopened session",
  "session.restore": "Restored session",
  "session.mark_paid_cash": "Marked paid by cash",
  "credits.grant": "Granted sessions",
  "credits.reverse": "Returned a spent session",
  "credits.revive": "Reopened a lapsed package",
  "package.extend_expiry": "Extended programme expiry",
  "package.reassign_therapist": "Reassigned programme therapist",
  "payout.settle": "Settled payout",
  "payout_request.start_review": "Started payout review",
  "payout_request.complete": "Completed payout request",
  "refund.issue": "Issued refund",
  "refund.partial": "Issued partial refund",
  "cash.correct_amount": "Corrected cash collected",
  "cash.mark_remitted": "Marked cash remitted",
  "cash.mark_refund_returned": "Marked cash refund returned",
  "expense.create": "Recorded a cost",
  "promo.create": "Created a promo code",
  "promo.update": "Changed a promo code",
  "promo.delete": "Deleted a promo code",
  "expense.delete": "Removed a cost",
  "therapist.set_revenue_share": "Changed therapist revenue share",
  "therapist.set_weekly_schedule": "Changed therapist working hours",
  "therapist.set_schedule_exception": "Set a schedule exception",
  "therapist.clear_schedule_exception": "Removed a schedule exception",
  "therapist.set_leave": "Changed therapist leave",
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
    action.startsWith("expense.") ||
    action.startsWith("promo.") ||
    action === "session.mark_paid_cash" ||
    action === "hospital.set_revenue_share" ||
    action === "therapist.set_revenue_share" ||
    // Handing a forfeited session back is money: the patient keeps value
    // they had otherwise lost, and the clinic's recognised revenue moves
    // with it.
    action === "session.restore" ||
    action.startsWith("credits.")
  );
}
