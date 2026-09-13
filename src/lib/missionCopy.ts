import { createPublicClient } from "@/lib/supabase/public";
import { resolveMissionCopy, type MissionCopy } from "@/lib/mission";

/**
 * The mission and vision as the public pages should print them.
 *
 * Read on its own and never merged into a page's other selects, and
 * deliberately **not** added to `SITE_SETTINGS_SELECT`: these are the newest
 * columns on `site_settings`, and that shared select is the one whose failure
 * takes every other setting down to its default with it -- the same treatment
 * `care_plan_requires_approval` and `therapist_suggestions_enabled` get, and
 * for the same reason. A database that has not re-run `schema.sql` therefore
 * prints the lines in `mission.ts`, which is what it printed before the
 * setting existed.
 *
 * It also keeps `/mission` from selecting forty columns to answer a question
 * about two sentences.
 *
 * Reads with the unauthenticated public client, like `readHomeVisitEnabled`:
 * these two lines are on the marketing site for anyone to read, so there is
 * nothing here that wants a privileged client -- including on the admin
 * screen that edits them.
 */
export async function readMissionCopy(): Promise<MissionCopy> {
  try {
    const { data, error } = await createPublicClient()
      .from("site_settings")
      .select("mission_statement, vision_statement")
      .maybeSingle();
    // An unreadable row is not an empty one: fall back to the reviewed copy
    // rather than to nothing, since a blank mission band reads as a broken
    // page on the one band whose job is to say who this clinic is.
    if (error) return resolveMissionCopy(null);
    return resolveMissionCopy(data);
  } catch {
    return resolveMissionCopy(null);
  }
}
