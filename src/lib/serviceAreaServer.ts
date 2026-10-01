import type { SupabaseClient } from "@supabase/supabase-js";
import { findAreaForPincode, type ServiceArea } from "@/lib/homeVisitAreas";

/**
 * Whether the clinic visits a pincode -- with "we could not ask" kept apart
 * from "no".
 *
 * Every caller used to read `home_visit_areas` and drop the error, so a
 * failed read was told "we don't come to you" (and the waitlist, a referral
 * and a referral's conversion each made their own different mistake on top).
 * One helper, so the four answer the same way.
 */
export type ServiceAreaLookup =
  | { ok: true; area: ServiceArea | null }
  | { ok: false; error: string };

export async function lookupServiceArea(
  client: SupabaseClient,
  pincode: string
): Promise<ServiceAreaLookup> {
  const { data, error } = await client
    .from("home_visit_areas")
    .select("id, city, area_name, pincode, travel_fee_paise, active")
    .eq("active", true)
    .eq("pincode", pincode);
  if (error) return { ok: false, error: error.message };
  return { ok: true, area: findAreaForPincode((data ?? []) as ServiceArea[], pincode) ?? null };
}
