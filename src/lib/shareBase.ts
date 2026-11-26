// What a therapist's percentage is taken of.
//
// A session priced for another country is charged the rupee equal of a local
// price: the Indian list price raised by that country's markup, converted and
// rounded up (countryPricing.ts). The share used to be a percentage of the
// whole charge, so a Rs 499 session sold in the US for Rs 1,059 paid the
// therapist 60% of Rs 1,059. The owner's decision: the share is worked out on
// the rupee list price, and the markup -- which covers exchange and gateway
// costs -- stays with the clinic.
//
// The amount paid is scaled by home / list, so a discount (taken off the
// raised figure) comes off the base in the same proportion. A rupee booking,
// or any row priced before `home_list_price_paise` existed, has no ratio and
// its base is the amount paid -- exactly what it was before.
//
// Dependency-free: read by the Money split (adminMetrics.moneyLineFor) and
// the payout maths (therapistPayouts.sessionTherapistCutPaise) alike, so the
// two can never disagree about a session.

export type ShareBaseFacts = {
  list_price_paise?: number | null;
  home_list_price_paise?: number | null;
};

/** The part of `feePaise` the therapist's percentage applies to. */
export function shareBasePaise(feePaise: number, a: ShareBaseFacts): number {
  const fee = Math.max(0, feePaise);
  const list = a.list_price_paise ?? null;
  const home = a.home_list_price_paise ?? null;
  if (list === null || home === null || list <= 0 || home < 0 || home >= list) return fee;
  return Math.round((fee * home) / list);
}

/** The markup a session carried: what the clinic keeps above the base. */
export function markupPaise(feePaise: number, a: ShareBaseFacts): number {
  return Math.max(0, Math.max(0, feePaise) - shareBasePaise(feePaise, a));
}
