import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The revenue-split rates in force on the day a session was delivered.
 *
 * Every money figure that splits a session -- the therapist's cut, a partner
 * hospital's commission, the clinic's own share -- used to be computed from
 * the percentages on `profiles` as they stand *now*. So renegotiating a
 * partner's commission, or changing a therapist's share, rewrote every
 * historical figure both of them had already been paid and invoiced on.
 *
 * Completion is when the rates are read, because completion is when the
 * money becomes real in this product: it is the exact condition that makes a
 * therapist's share payable, and pay later's whole design turns on "nothing
 * is owed until the work is done". A rate read at booking would be the rate
 * in force when somebody clicked, which is not when anybody earned anything.
 *
 * Best-effort, and that is deliberate. This runs inside `complete-session`,
 * which is the one write a therapist must always be able to make: refusing
 * to close a session because a rate lookup failed would leave the one
 * session that has to be closed as the one that cannot be, and completion is
 * what creates the debt, the revenue and the therapist's pay. A row that
 * ends up with no snapshot simply falls back to the live percentage, exactly
 * as every row predating these columns does.
 */
export type SettlementRates = {
  therapistSharePercent: number | null;
  hospitalSharePercent: number | null;
  hospitalId: string | null;
};

export async function readSettlementRates(
  admin: SupabaseClient,
  input: {
    therapistId: string | null;
    patientId: string | null;
    /** A home visit may carry a separate therapist rate. */
    isHomeVisit: boolean;
  }
): Promise<SettlementRates> {
  const rates: SettlementRates = {
    therapistSharePercent: null,
    hospitalSharePercent: null,
    hospitalId: null,
  };

  try {
    if (input.therapistId) {
      const { data: therapist } = await admin
        .from("profiles")
        .select("revenue_share_percent, home_visit_revenue_share_percent")
        .eq("id", input.therapistId)
        .maybeSingle();

      if (therapist) {
        // The home-visit rate falls back to the online one when a therapist
        // has none -- the same rule the payout maths already applies, read
        // from one place so the snapshot and the payout cannot disagree.
        const online = therapist.revenue_share_percent;
        const visit = therapist.home_visit_revenue_share_percent;
        const chosen = input.isHomeVisit ? (visit ?? online) : online;
        rates.therapistSharePercent = chosen ?? null;
      }
    }

    if (input.patientId) {
      const { data: patient } = await admin
        .from("profiles")
        .select("referred_by_hospital_id")
        .eq("id", input.patientId)
        .maybeSingle();

      const hospitalId = patient?.referred_by_hospital_id ?? null;
      if (hospitalId) {
        rates.hospitalId = hospitalId;
        const { data: hospital } = await admin
          .from("profiles")
          .select("revenue_share_percent")
          .eq("id", hospitalId)
          .maybeSingle();
        // Left null when the partner's share is not configured. That is not
        // the same as zero, and the money maths already tells those two
        // apart -- a hospital-referred session whose commission is unknown
        // is excluded from the split and reported, never guessed at.
        rates.hospitalSharePercent = hospital?.revenue_share_percent ?? null;
      }
    }
  } catch (err) {
    console.error("Could not read settlement rates for a completing session", err);
  }

  return rates;
}
