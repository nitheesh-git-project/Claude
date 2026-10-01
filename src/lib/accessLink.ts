import crypto from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A one-time link that lets somebody set their own password -- what an admin
 * hands over instead of a password.
 *
 * The clinic used to generate a password, store its plaintext in the
 * `*_admin_notes` tables and show it back to any admin for up to fourteen
 * days, so one service-role leak (or one look at a screen) exposed working
 * credentials for every account recently created or reset. Nothing is stored
 * now: the link is Supabase's own recovery token, single-use and expiring on
 * Supabase's schedule (Authentication -> Email OTP expiry), shown to the
 * admin once to pass on. Losing it costs nothing -- generate another.
 *
 * Returned as a path, not a URL: the admin's browser knows the origin the
 * person should open, and a server behind a proxy may not.
 */
export async function issueSetPasswordLink(
  admin: AdminClient,
  email: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { ok: false, error: error?.message ?? "Could not create a sign-in link." };
  }
  return {
    ok: true,
    path: `/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`,
  };
}

/**
 * A password nobody knows, for an account that will set its own through
 * the link above -- and for a reset, which must still lock out whoever holds
 * the current one. Never stored, never returned.
 */
export function unknowablePassword(): string {
  return crypto.randomBytes(32).toString("base64url");
}
