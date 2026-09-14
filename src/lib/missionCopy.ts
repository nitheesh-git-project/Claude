import { createPublicClient } from "@/lib/supabase/public";
import {
  resolveMissionCopy,
  resolveMissionPrinciples,
  type MissionCopy,
  type MissionPrinciple,
} from "@/lib/mission";

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

/** One row of the promises-and-limits table, as the pages read it. */
export type MissionPrincipleRow = {
  id: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  icon: string | null;
  active: boolean | null;
  display_order: number | null;
};

/**
 * The promises and the limits, resolved for both bands in one read.
 *
 * One query rather than two: they are one table, and the public policy already
 * limits what comes back to the active rows. Isolated from every other read on
 * the page for the same reason as the two lines above -- the table is newer
 * than the pages that render it, so a database that has not run `schema.sql`
 * shows the wording this repository ships instead of failing whichever query
 * it had been bundled into.
 *
 * Errors fall back the same way, which is the whole reason this is not inlined
 * into the pages: on `/mission` these two bands are the page.
 */
export async function readMissionPrinciples(): Promise<{
  promises: MissionPrinciple[];
  limits: MissionPrinciple[];
}> {
  let rows: MissionPrincipleRow[] | null = null;
  try {
    const { data, error } = await createPublicClient()
      .from("mission_principles")
      .select("id, kind, title, body, icon, active, display_order")
      .order("display_order", { ascending: true })
      .order("title", { ascending: true });
    if (!error) rows = (data ?? []) as MissionPrincipleRow[];
  } catch {
    rows = null;
  }
  return {
    promises: resolveMissionPrinciples("promise", rows),
    limits: resolveMissionPrinciples("limit", rows),
  };
}
