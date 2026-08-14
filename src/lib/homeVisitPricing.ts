// Home-visit money math, dependency-free (see AGENTS.md's "business math
// lives in dependency-free src/lib/ modules"). The rule this file exists to
// hold in one place: the travel fee is a reimbursement paid through to the
// therapist, NOT revenue, so it is tracked separately from the package
// price everywhere -- at checkout, on the receipt, and in the payout split.

export type HomeVisitTotal = {
  packagePricePaise: number;
  travelFeePaise: number;
  totalPaise: number;
  perVisitPaise: number;
  // What the patient is told about travel: included in the headline price,
  // added on top, or simply not charged for this area.
  travelLabel: "included" | "added" | "none";
};

/**
 * Resolves what a home-visit purchase actually costs.
 *
 * `travelIncluded` is the package's own `travel_fee_included` flag: an
 * "all inclusive" package advertises one number and absorbs the area's fee
 * rather than zeroing out every service area's travel cost to achieve the
 * same thing. The fee is still returned (the therapist is still owed it),
 * it just doesn't increase what the patient pays.
 */
export function computeHomeVisitTotal({
  packagePricePaise,
  travelFeePaise,
  travelIncluded,
  visitCount,
}: {
  packagePricePaise: number;
  travelFeePaise: number;
  travelIncluded: boolean;
  visitCount: number;
}): HomeVisitTotal {
  const visits = visitCount > 0 ? visitCount : 1;
  const fee = Math.max(0, travelFeePaise);

  // Travel is charged per visit, not per purchase -- the therapist makes
  // the trip once for every visit in the programme.
  const chargedTravel = travelIncluded ? 0 : fee * visits;
  const totalPaise = packagePricePaise + chargedTravel;

  return {
    packagePricePaise,
    travelFeePaise: fee,
    totalPaise,
    perVisitPaise: Math.round(totalPaise / visits),
    travelLabel: fee === 0 ? "none" : travelIncluded ? "included" : "added",
  };
}

/**
 * The per-visit amount snapshotted onto each appointment, excluding travel.
 *
 * Deliberately mirrors bookPackageSession's
 * `Math.round(amount_paid_paise / session_count)`: this is the figure the
 * revenue-share math multiplies by, and travel must never be inside it or
 * the therapist would be funding their own transport out of their own cut.
 */
export function computePerVisitFeePaise(
  packageAmountPaidPaise: number | null,
  visitCount: number
): number {
  if (!packageAmountPaidPaise || visitCount <= 0) return 0;
  return Math.round(packageAmountPaidPaise / visitCount);
}

/**
 * The therapist's cut of one home visit.
 *
 * `homeVisitSharePercent` is profiles.home_visit_revenue_share_percent and
 * falls back to the therapist's ordinary revenue_share_percent when unset --
 * "no separate home-visit rate" rather than "no earnings". Returns null when
 * neither is configured, matching computeTherapistEarningRows()'s deliberate
 * choice to show nothing rather than imply zero.
 *
 * The travel fee is added on top of the share, at 100%.
 */
export function computeHomeVisitTherapistPayoutPaise({
  feePaise,
  travelFeePaise,
  homeVisitSharePercent,
  defaultSharePercent,
}: {
  feePaise: number;
  travelFeePaise: number;
  homeVisitSharePercent: number | null;
  defaultSharePercent: number | null;
}): number | null {
  const share = homeVisitSharePercent ?? defaultSharePercent;
  if (share === null || share === undefined) return null;
  return Math.round((feePaise * share) / 100) + Math.max(0, travelFeePaise);
}
