import { createPublicClient } from "@/lib/supabase/public";

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
 * bundled into. Fails closed — an unreadable flag hides the mode instead of
 * advertising one the clinic cannot deliver.
 */
export async function readHomeVisitEnabled(): Promise<boolean> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  return data?.home_visit_enabled === true;
}
