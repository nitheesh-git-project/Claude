import type { AdminScope } from "@/lib/adminScope";
import type { AdminSectionKey } from "@/lib/adminNav";

// Whose activity a desk reads.
//
// Today's feed carried the last ten admin actions unfiltered, so an
// Operations admin's own screen led with a Master Admin re-pricing a package
// and a Finance admin settling a payout -- work they cannot do, on rows they
// cannot open, above the queues that are actually theirs. Everything else on
// Today is already scope-shaped in adminHome.ts; the feed was the one thing
// that was not.
//
// Two tests, and an entry has to pass both:
//
//   1. **The action belongs to a section this desk can work.** Derived from
//      the section each route guards with (`requireAdminScope`), so the feed
//      cannot show an action whose screen the reader is refused at -- the
//      same rule the quick actions follow.
//   2. **The actor sits at that desk.** An Operations admin sees what
//      Operations did. This is narrower than (1) alone, and deliberately so:
//      it is what the clinic asked for, so that one desk does not read
//      another's work or a Master Admin's.
//
// The cost of (2) is worth stating where the next person will find it: in a
// small clinic the Master Admin does most of the work, so these feeds can be
// sparse or empty. That is why the empty state on a scoped feed says whose
// activity it is showing rather than "nothing has happened" -- the second
// would be false.
//
// A Master Admin is unfiltered. Their desk is the whole back office.

/**
 * Which section's capability each action belongs to.
 *
 * Taken from the `requireAdminScope("…")` the action's own route guards with
 * rather than invented here, because that is what actually decides whether
 * the reader could open the screen behind the row. Where a route family
 * spans two sections (an account suspension is `people` for a patient and
 * `settings` for an admin), the entry names the commoner one -- the actor
 * test above covers the other case, since only a Master Admin can suspend
 * an admin.
 *
 * `full_only` marks the capabilities no *limited* desk's section grants:
 * minting an account, changing a scope, resetting the database, signing in
 * as somebody, and clearing old log entries. They are a Master Admin's
 * alone, so no scoped desk reads them.
 */
export type ActionDomain = AdminSectionKey | "full_only";

export const ACTION_DOMAIN: Record<string, ActionDomain> = {
  // people
  "account.approve": "people",
  "account.decline": "people",
  "account.set_active": "people",
  "account.reset_password": "people",
  "profile_change.approve": "people",
  "profile_change.decline": "people",
  "patient.update_contact": "people",
  "patient.update_notes": "people",
  "therapist.update_contact": "people",
  "therapist.update_notes": "people",
  "therapist.update_display_content": "people",
  "therapist.set_team_visibility": "people",
  "therapist.set_rating_visibility": "people",
  "therapist.set_leave": "people",
  "hospital.onboard": "people",
  "hospital.set_active": "people",
  "referral.assign": "people",
  "referral.decline": "people",
  "referral.set_capacity_note": "people",
  "lead.update_status": "people",

  // sessions
  "session.create": "sessions",
  "session.assign": "sessions",
  "session.update": "sessions",
  "session.cancel": "sessions",
  "session.reopen": "sessions",
  "session.update_visit_address": "sessions",
  "therapist.set_weekly_schedule": "sessions",
  "therapist.set_schedule_exception": "sessions",
  "therapist.clear_schedule_exception": "sessions",
  "care_plan.approve": "sessions",
  "care_plan.reject": "sessions",
  "care_plan.edit_and_approve": "sessions",
  "care_plan.withdraw": "sessions",
  "care_plan.author_on_behalf": "sessions",
  "rating.clear": "sessions",
  "rating.exclude": "sessions",
  // Clinical records. Guarded as sessions-adjacent capabilities and read by
  // the desk that works the care queues.
  "condition_access.decide": "sessions",
  "condition_change.decide": "sessions",
  "condition_change.direct_edit": "sessions",
  "pain_assessment.create": "sessions",

  // money
  "payment.goodwill_discount": "money",
  "payout.settle": "money",
  "payout_request.start_review": "money",
  "payout_request.complete": "money",
  "refund.issue": "money",
  "refund.partial": "money",
  "cash.correct_amount": "money",
  "cash.mark_remitted": "money",
  "cash.mark_refund_returned": "money",
  "expense.create": "money",
  "expense.delete": "money",
  "promo.create": "money",
  "promo.update": "money",
  "promo.delete": "money",
  "credits.grant": "money",
  "credits.reverse": "money",
  "credits.revive": "money",
  "session.mark_paid_cash": "money",
  "therapist.set_revenue_share": "money",
  "hospital.set_revenue_share": "money",

  // catalog
  "catalog.create": "catalog",
  "catalog.update": "catalog",
  "catalog.delete": "catalog",
  "package.extend_expiry": "catalog",
  "package.reassign_therapist": "catalog",
  "home_visit.waitlist_status": "catalog",
  // Handing a forfeited session back is a catalog-guarded route, and it is
  // money as well -- isMoneyAction counts it. The domain here answers "which
  // screen could the reader open", which is the Purchases table.
  "session.restore": "catalog",

  // settings
  "setting.update": "settings",
  "session.open_meet_access": "settings",
  "session.retry_meet_sync": "settings",
  "clinical_questions.update_intake": "settings",
  "clinical_questions.update_pain_map": "settings",

  // today
  "risk.review": "today",

  // A Master Admin's alone: no section grants any of these.
  "account.create": "full_only",
  // Irreversible and Master-Admin-only, like minting one.
  "account.delete": "full_only",
  "admin.set_scope": "full_only",
  "data.reset": "full_only",
  // The Logs section is Master Admin's alone, so clearing it is too.
  "log.clear": "full_only",
  "impersonation.start": "full_only",
  "impersonation.end": "full_only",
};

export type ActivityViewer = {
  scope: AdminScope;
  /** Sections this admin can actually work (manage), from `adminScope.ts`. */
  workableSections: readonly AdminSectionKey[];
};

export type ActivityActor = {
  /** The acting admin's scope, or null when it cannot be resolved. */
  scope: AdminScope | null;
};

/**
 * Whether this desk may read this entry.
 *
 * An unknown action is **hidden from a scoped desk and shown to a Master
 * Admin**. The two directions are deliberate: a new action with no entry in
 * the map above is one nobody has decided the audience for, and guessing
 * "everyone" would leak it to three desks, while guessing "nobody" would
 * hide it from the one reader who can always see everything anyway.
 * `activityScope.test.ts` fails when an action in the union has no domain,
 * so the unknown case is a safety net rather than the normal path.
 */
export function canReadActivity(
  viewer: ActivityViewer,
  actor: ActivityActor,
  action: string
): boolean {
  if (viewer.scope === "full") return true;

  const domain = ACTION_DOMAIN[action];
  if (!domain || domain === "full_only") return false;
  if (!viewer.workableSections.includes(domain)) return false;

  // The actor test. A Master Admin's work is hidden from a scoped desk even
  // when its domain matches -- see this module's own note on what that
  // costs.
  return actor.scope === viewer.scope;
}

/** Filter a list of entries for one reader, keeping the given order. */
export function filterActivityForViewer<
  T extends { action: string; actorScope: AdminScope | null },
>(viewer: ActivityViewer, rows: T[]): T[] {
  if (viewer.scope === "full") return rows;
  return rows.filter((row) => canReadActivity(viewer, { scope: row.actorScope }, row.action));
}

/** What an empty or filtered feed says it is showing. A scoped desk reading
 *  "nothing has happened" when in fact a Master Admin has been working all
 *  morning would be told something false. */
export function activityScopeNote(scope: AdminScope): string | null {
  if (scope === "full") return null;
  return "Only your own desk's activity is shown here.";
}
