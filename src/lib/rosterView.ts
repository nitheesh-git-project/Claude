// The Roster screen's one-shot `view` preset: `therapist:<id>` opens the
// roster on that therapist's hours. Sent by the "Unable to assign this
// therapist" dialog, so the admin lands on the schedule that blocked them
// instead of the first therapist in the list.
export const ROSTER_THERAPIST_VIEW_PREFIX = "therapist:";

/** The therapist id a roster `view` preset names, or null. */
export function rosterTherapistFromView(view: string | null | undefined): string | null {
  if (!view || !view.startsWith(ROSTER_THERAPIST_VIEW_PREFIX)) return null;
  const id = view.slice(ROSTER_THERAPIST_VIEW_PREFIX.length).trim();
  return id || null;
}
