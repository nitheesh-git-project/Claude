import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ends every signed-in session for one account.
 *
 * Suspending somebody used to be a single write to `profiles.active`, and
 * that column is read in two places: `src/proxy.ts` (dashboard navigation)
 * and `requireActiveProfile` / `getAdminUser` inside the API routes. Both
 * are this application. Neither runs when the suspended account talks to
 * PostgREST directly with the publishable anon key and the access token it
 * already holds -- and Supabase keeps rotating that account's refresh
 * token, so "already holds" has no end date.
 *
 * `is_admin()` now refuses a suspended admin at the RLS layer too (see
 * schema.sql), which closes the read path. This closes the session itself,
 * which is the part a policy cannot do: an account that has been suspended
 * should not still be signed in anywhere.
 *
 * It goes through the `revoke_user_sessions` database function rather than
 * `auth.admin.signOut`, because that call takes the suspended person's own
 * JWT -- which an admin route does not have -- and the GoTrue admin
 * endpoints that would do it by id answer 404 on this project's version.
 * Both were tested before this shape was settled on.
 *
 * It stops renewal rather than killing a token mid-flight: an access token
 * is a signed JWT and stays valid until it expires. Remaining exposure is
 * therefore one JWT lifetime (an hour by default), during which
 * `is_admin()` and each route's own `active` check already refuse them.
 *
 * Returns whether it worked rather than throwing. The `active` write has
 * already landed by the time this is called, so a failure here means "the
 * door is locked but they are still inside", which the caller should say
 * out loud rather than swallow -- but it is never a reason to leave the
 * account un-suspended.
 */
export async function revokeAllSessions(
  admin: SupabaseClient,
  userId: string
): Promise<{ revoked: boolean; error: string | null }> {
  try {
    const { error } = await admin.rpc("revoke_user_sessions", {
      p_user_id: userId,
    });
    if (error) {
      console.error("Could not revoke sessions for", userId, error.message);
      return { revoked: false, error: error.message };
    }
    return { revoked: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Could not revoke sessions for", userId, message);
    return { revoked: false, error: message };
  }
}

/**
 * The line a suspend route adds to its response when the sessions could
 * not be ended. Named here so all four routes say the same thing.
 */
export const SESSION_REVOKE_WARNING =
  "Access was suspended, but their existing sign-in could not be ended automatically. They will be locked out within the hour as their token expires.";
