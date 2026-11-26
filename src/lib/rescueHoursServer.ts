import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseRescueHours } from "@/lib/sessionPatientActions";

/**
 * `site_settings.unassigned_rescue_hours` (default 4): with fewer hours than
 * this to go and nobody assigned, the patient is offered a refund or a new
 * time (sessionPatientActions.ts). Its own query, so a database that has not
 * had the column added yet keeps the default instead of failing every other
 * setting with it.
 */
export async function readUnassignedRescueHours(admin: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await admin.from("site_settings").select("unassigned_rescue_hours").maybeSingle();
    if (error) return normaliseRescueHours(null);
    return normaliseRescueHours((data as { unassigned_rescue_hours?: unknown } | null)?.unassigned_rescue_hours);
  } catch {
    return normaliseRescueHours(null);
  }
}
