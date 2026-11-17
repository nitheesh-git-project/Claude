// Changing a password from the profile, as opposed to the reset link.
//
// The reset link (/reset-password) proves who you are by the email it came
// through, so it asks only for the new password. A change from the profile
// has only the session to go on -- which may be a borrowed laptop -- so it
// also asks for the current password, and the server checks it.
// Dependency-free so the rules are unit-tested.

/** The same floor as the sign-up and reset forms (PasswordField). */
export const MIN_PASSWORD_LENGTH = 6;
/** Supabase's own ceiling for a password. */
export const MAX_PASSWORD_LENGTH = 72;

export function validatePasswordChange(
  current: unknown,
  next: unknown
): { ok: true; current: string; next: string } | { ok: false; error: string; field: "current" | "next" } {
  if (typeof current !== "string" || current.length === 0) {
    return { ok: false, field: "current", error: "Enter your current password." };
  }
  if (typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, field: "next", error: `The new password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, field: "next", error: `Keep the new password under ${MAX_PASSWORD_LENGTH + 1} characters.` };
  }
  if (next === current) {
    return { ok: false, field: "next", error: "The new password is the same as the current one." };
  }
  return { ok: true, current, next };
}
