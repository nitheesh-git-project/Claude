// The vocabulary of the risk layer, with no database in it.
//
// Split from the detectors so the admin screen, the review route and the
// detectors themselves agree on what a rule is called and what a status
// means, and so the parts that are pure -- deciding whether a count crosses
// a threshold, wording a summary -- can be reasoned about without a
// connection. Same convention as the six money modules.

export const RISK_RULE_KEYS = [
  "contact_leak",
  "completion_without_payment",
  "early_completion",
  "cash_variance",
  "contact_reveal_volume",
  "manual_adjustment_volume",
  "plan_conversion_low",
  "post_consultation_dropout",
] as const;

export type RiskRuleKey = (typeof RISK_RULE_KEYS)[number];

export type RiskSubjectKind =
  | "therapist"
  | "patient"
  | "appointment"
  | "payment"
  | "entitlement"
  | "admin";

export type RiskSeverity = "low" | "medium" | "high";

/**
 * `open` and `reviewing` both hold the one-open-per-subject index, so a
 * signal an admin has picked up does not immediately reappear behind them.
 * `dismissed` and `actioned` release it -- if the behaviour continues, the
 * next sweep raises a fresh signal, which is the correct outcome: a
 * repeated finding after a dismissal is new information.
 */
export type RiskStatus = "open" | "reviewing" | "dismissed" | "actioned";

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Needs a look",
  reviewing: "Being reviewed",
  dismissed: "Nothing in it",
  actioned: "Acted on",
};

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  low: "Low",
  medium: "Worth a look",
  high: "Look now",
};

export type RiskRule = {
  ruleKey: string;
  label: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type RiskSignal = {
  id: string;
  ruleKey: string;
  subjectKind: RiskSubjectKind;
  subjectId: string;
  severity: RiskSeverity;
  summary: string;
  evidence: Record<string, unknown>;
  status: RiskStatus;
  detectedAt: string;
};

/** Minimum length of a review note, mirrored by the table's own CHECK. */
export const MIN_REVIEW_NOTE_LENGTH = 10;

/**
 * Reads one number out of a rule's free-form config.
 *
 * Every detector needs this and every detector would otherwise write its
 * own `typeof x === "number" ? x : fallback`, which is how one of them ends
 * up treating a missing key as zero and firing on the whole clinic.
 */
export function ruleNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Whether a rate crosses a floor, given enough observations to mean
 * anything.
 *
 * The sample-size guard is the point: a therapist with two recommendations
 * and one purchase has a 50% conversion rate and no story at all, and a
 * detector that says otherwise is what makes an admin stop reading the
 * queue.
 */
export function belowRate(
  numerator: number,
  denominator: number,
  minObservations: number,
  floor: number
): boolean {
  if (denominator < minObservations) return false;
  return numerator / denominator < floor;
}

/** Human count with the right plural, used in every detector's summary. */
export function countPhrase(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}
