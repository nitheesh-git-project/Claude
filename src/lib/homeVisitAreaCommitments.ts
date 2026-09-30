import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Visits the clinic has been paid for and still has to drive to, per area.
 *
 * **The policy this exists to make visible: a purchase is honoured.** A
 * patient who bought six visits and has had two keeps the other four even if
 * the clinic later stops serving their pincode, at the travel fee frozen on
 * their purchase. That is already how the code behaves -- `book-visits` does
 * not re-check serviceability, and `bookHomeVisitSession` reads
 * `purchase.travel_fee_paise` rather than the live area row -- but it
 * behaved that way by omission rather than by decision, and nothing said so.
 *
 * The decision is that honouring it is right: the catchment changing is the
 * clinic's choice and not the patient's, and withdrawing treatment somebody
 * has already paid for is the one outcome a service area must not produce.
 * Refunding instead is still available and is an admin's call per purchase,
 * on the screen that already does refunds.
 *
 * What was genuinely missing is the other half: an admin could deactivate an
 * area with no idea the clinic still owed eleven visits there. The area row
 * says so now, and the deactivate confirmation names it.
 *
 * Returns an empty map when it could not be asked. A count that quietly
 * reads zero would be worse than none here, so the screen distinguishes the
 * two -- see `ServiceAreaRow.pending_visits`, which is `null` rather than 0
 * when the read failed.
 */
export type AreaCommitments = Map<string, { purchases: number; visits: number }>;

export async function readHomeVisitAreaCommitments(
  admin: SupabaseClient
): Promise<AreaCommitments | null> {
  try {
    const { data: purchases, error } = await admin
      .from("home_visit_package_purchases")
      .select("id, visit_count, visits_used, default_address_id")
      .eq("status", "active")
      .not("default_address_id", "is", null);
    if (error) return null;

    const owed = (purchases ?? [])
      .map((p) => ({
        addressId: p.default_address_id as string,
        pending: Math.max((p.visit_count as number) - (p.visits_used as number), 0),
      }))
      .filter((p) => p.pending > 0);
    if (owed.length === 0) return new Map();

    // The address is what carries the area, and it is read separately rather
    // than joined: `patient_addresses` is the patient's own table and an
    // embedded select here would be a second shape to keep in step with it.
    const { data: addresses, error: addressError } = await admin
      .from("patient_addresses")
      .select("id, area_id")
      .in("id", Array.from(new Set(owed.map((p) => p.addressId))));
    if (addressError) return null;

    const areaByAddress = new Map(
      (addresses ?? []).map((a) => [a.id as string, (a.area_id as string | null) ?? null])
    );

    const commitments: AreaCommitments = new Map();
    for (const row of owed) {
      const areaId = areaByAddress.get(row.addressId) ?? null;
      // An address with no area is one bought before areas carried ids, or
      // one whose area has already been deleted. There is no row to put the
      // count on, and inventing one would name an area that is not there.
      if (!areaId) continue;
      const current = commitments.get(areaId) ?? { purchases: 0, visits: 0 };
      commitments.set(areaId, {
        purchases: current.purchases + 1,
        visits: current.visits + row.pending,
      });
    }
    return commitments;
  } catch {
    return null;
  }
}
