import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shapeCareStatus, type CareStatusEvent } from "@/lib/careStatus";
import type { ProfileKind } from "@/lib/outcomeMeasures";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/**
 * The display name of whoever wrote the current "Where things stand" text,
 * for its byline ("Dr Farhan Sheikh, 12 Oct"). The same rules the care plan
 * cards follow: a therapist's name is not readable through a patient's or a
 * therapist's own session (profiles_select_own), so it is looked up with the
 * admin client, by the id the event already carries; the clinic's own text
 * (an admin wrote it) is never given a name - it reads "The clinic". A failed
 * lookup is null, which the card words as "Your physiotherapist": a name is
 * never guessed, and its absence never hides the summary.
 */
export async function loadSummaryAuthorName(
  admin: AnyClient,
  events: readonly CareStatusEvent[],
  profileKind: ProfileKind
): Promise<string | null> {
  const summary = shapeCareStatus(events, { profileKind }).summary;
  if (!summary || summary.setByRole !== "therapist") return null;
  try {
    const { data, error } = await admin.from("profiles").select("full_name").eq("id", summary.setBy).maybeSingle();
    if (error) return null;
    const name = typeof data?.full_name === "string" ? data.full_name.trim() : "";
    return name || null;
  } catch {
    return null;
  }
}
