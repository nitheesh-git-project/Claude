// The one line every patient dashboard screen carries while something waits
// on the patient in Suggested Sessions: a recommendation to accept, or times
// a therapist proposed. Dependency-free so it can be tested without a page.

import { carePlanState, parseOfferSnapshot, type CarePlanStatus } from "@/lib/carePlans";

export type SuggestedTeaser =
  | {
      kind: "plan";
      title: string;
      sessionCount: number;
      isHomeVisit: boolean;
      pricePaise: number;
      imageUrl: string | null;
    }
  | { kind: "times"; count: number };

type PlanLike = {
  status: string;
  version: {
    offerKind: string;
    offerSnapshot: unknown;
    expiresAt: string | null;
  } | null;
} | null;

/**
 * A recommendation waiting for the patient's answer comes first -- it is the
 * one that costs money and lapses. Proposed times come next. Anything the
 * patient cannot act on (a plan the clinic has not approved, one that has
 * lapsed) is not mentioned: a nudge towards a screen with nothing to do on
 * it is how a nudge stops being read.
 */
export function buildSuggestedTeaser(
  plan: PlanLike,
  pendingSuggestionCount: number,
  nowMs: number
): SuggestedTeaser | null {
  if (plan?.version) {
    const state = carePlanState(
      { status: plan.status as CarePlanStatus },
      { expires_at: plan.version.expiresAt },
      nowMs
    );
    const snapshot = parseOfferSnapshot(plan.version.offerSnapshot);
    if (state === "awaiting_patient" && snapshot) {
      return {
        kind: "plan",
        title: snapshot.title,
        sessionCount: snapshot.sessionCount,
        isHomeVisit: plan.version.offerKind === "home_visit_package",
        pricePaise: snapshot.pricePaise,
        imageUrl: snapshot.imageUrl,
      };
    }
  }
  if (pendingSuggestionCount > 0) return { kind: "times", count: pendingSuggestionCount };
  return null;
}
