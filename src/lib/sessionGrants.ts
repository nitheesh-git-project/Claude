// The three reasons an admin puts sessions into someone's account by hand,
// and what each one means for the books.
//
// Dependency-free, per the business-math rule in AGENTS.md, so the route,
// the admin UI and the money screens all read one definition rather than
// three that drift.
//
// The distinction that matters is revenue. A goodwill or service-recovery
// grant is the clinic giving something away: no money came in, and counting
// it as revenue would let generosity inflate the books. Cash taken outside
// the gateway did earn money, and must count. Getting this backwards is not
// a cosmetic error -- it is the difference between a Money screen that can
// be trusted and one that cannot.

export const GRANT_KINDS = ["service_recovery", "goodwill", "offline_paid"] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export function isGrantKind(value: unknown): value is GrantKind {
  return typeof value === "string" && (GRANT_KINDS as readonly string[]).includes(value);
}

export const GRANT_KIND_LABELS: Record<GrantKind, string> = {
  service_recovery: "Service recovery",
  goodwill: "Goodwill",
  offline_paid: "Paid offline",
};

export const GRANT_KIND_BLURBS: Record<GrantKind, string> = {
  service_recovery:
    "Something on our side went wrong — the therapist didn't join, the call dropped, the link never worked.",
  goodwill: "A gesture: resolving a complaint, or keeping a patient who was about to leave.",
  offline_paid: "The patient genuinely paid, outside the payment gateway. This counts as revenue.",
};

/** Whether money actually came in. Only `offline_paid` did. */
export function grantIsRevenue(kind: GrantKind): boolean {
  return kind === "offline_paid";
}

/**
 * Whether delivering a session from this grant should earn the therapist
 * their share, as a *default* the admin can override per grant.
 *
 * Defaulting service recovery to unpaid and offline-paid to paid is right
 * far more often than either blanket rule, but neither is right always:
 * a therapist who no-showed should not be paid for the replacement, and a
 * therapist whose patient's broadband failed should. That judgement is the
 * admin's, which is why this is a default rather than a rule.
 */
export function grantDefaultTherapistPayable(kind: GrantKind): boolean {
  return kind === "offline_paid";
}
