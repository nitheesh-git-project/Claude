// What one booking's service line costs, before any discount and before
// travel.
//
// Extracted so the promo code preview and the order that follows it cannot
// work from two different prices. A preview quoting "₹200 off ₹1,200" over a
// checkout that then charges against ₹999 is the payment-screen bug this app
// keeps correcting: quoting a different figure than you charge.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

/**
 * Looked up with the admin client rather than the active-only public
 * policy, so a category deactivated after this appointment was created
 * still charges the price the patient originally saw rather than silently
 * bumping them to the flat fallback fee. No category (a hospital-referred
 * booking) charges that flat base fee.
 */
export async function readAppointmentServicePrice(
  admin: SupabaseClient,
  categoryId: string | null | undefined
): Promise<number> {
  if (!categoryId) return SESSION_FEE_PAISE;
  const { data } = await admin
    .from("treatment_categories")
    .select("price_paise")
    .eq("id", categoryId)
    .maybeSingle();
  const price = (data as { price_paise?: number | null } | null)?.price_paise;
  return typeof price === "number" && price > 0 ? price : SESSION_FEE_PAISE;
}
