/**
 * How long a credential the clinic issued stays readable.
 *
 * The four `*_admin_notes` tables keep the plaintext of a password this app
 * **generated**, so an admin taking an "it won't let me in" call can read it
 * back rather than resetting a working one. The tables carry no RLS policies
 * at all and only the service role reads them, and the value is cleared the
 * moment the account sets its own password.
 *
 * What was missing is an end date. A credential nobody collected sat there
 * indefinitely, and after a week it has no support value left -- by then the
 * person has either signed in or rung again -- while remaining a real
 * liability: one service-role key leak exposes every password the clinic has
 * ever issued, including for accounts that have long since been handed over.
 *
 * So it expires on read as well as on use. Fourteen days is the judgement:
 * long enough for somebody onboarded before a holiday, short enough that the
 * set of live plaintext credentials is small and bounded at any moment.
 *
 * Expiring on **read** rather than by a sweep is deliberate and matches how
 * everything time-based works in this deployment -- there is no worker to run
 * one, and a status column recording the passage of time would need
 * sweeping itself. `purge_expired_temp_passwords()` exists as well, for the
 * separate job of not keeping the row on disk, and is run from the same lazy
 * sweep the dashboard already carries.
 */
export const TEMP_PASSWORD_VISIBLE_DAYS = 14;

export const TEMP_PASSWORD_VISIBLE_MS = TEMP_PASSWORD_VISIBLE_DAYS * 24 * 60 * 60 * 1000;

export type TempPasswordNote = {
  temp_password?: string | null;
  temp_password_set_at?: string | null;
} | null | undefined;

/**
 * The credential, if it is still worth showing.
 *
 * Three outcomes rather than two, for the reason every other read in this
 * codebase splits them: `null` means there is nothing to show, and that is
 * true both for an account that set its own password (the value was cleared)
 * and for one whose issued credential has aged out. The screen says which,
 * because "they have set their own password" and "the one we issued has
 * expired, issue another" are different things for an admin to do next.
 */
export function readableTempPassword(
  note: TempPasswordNote,
  nowMs: number
): { password: string | null; expired: boolean } {
  const password = note?.temp_password?.trim() || null;
  if (!password) return { password: null, expired: false };

  const setAt = note?.temp_password_set_at;
  if (!setAt) {
    // Set before the timestamp column existed. Treated as expired rather
    // than as fresh: an undated credential could be arbitrarily old, and the
    // safe reading of "I don't know when this was issued" is not "show it".
    return { password: null, expired: true };
  }

  const setMs = new Date(setAt).getTime();
  if (!Number.isFinite(setMs)) return { password: null, expired: true };

  if (nowMs - setMs > TEMP_PASSWORD_VISIBLE_MS) {
    return { password: null, expired: true };
  }

  return { password, expired: false };
}
