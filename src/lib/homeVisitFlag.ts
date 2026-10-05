import { createPublicClient } from "@/lib/supabase/public";
import { parseEnabledIntakeSpecialties } from "@/lib/adminSettings";
import type { ConditionSpecialty } from "@/lib/conditionSpecialty";

/**
 * Whether the clinic currently sells home visits.
 *
 * Every public page needs this now, because every public page ends in the
 * connector strip and that strip must not link to /home-visit while the page
 * behind it 404s. Kept in one function rather than copied into seven pages so
 * the isolated-read reasoning below lives in one place.
 *
 * Read on its own and never merged into a page's other selects: the column is
 * migration-dependent, and a database that has not re-run schema.sql should
 * lose one card from one strip rather than blank whichever query it was
 * bundled into. Fails closed - an unreadable flag hides the mode instead of
 * advertising one the clinic cannot deliver.
 */
export async function readHomeVisitEnabled(): Promise<boolean> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  return data?.home_visit_enabled === true;
}

/**
 * The specialties whose health profile the clinic offers, for the public
 * showcase on /how-it-works and the home page. Its own query like the flag
 * above; a read that fails falls back to the default list rather than
 * hiding the showcase (it describes the product, it grants nothing).
 */
export async function readEnabledIntakeSpecialties(): Promise<ConditionSpecialty[]> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("enabled_intake_specialties")
    .maybeSingle();
  return parseEnabledIntakeSpecialties(data?.enabled_intake_specialties);
}
