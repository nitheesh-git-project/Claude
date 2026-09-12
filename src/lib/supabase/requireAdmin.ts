import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseAdminScope, scopeCanManage, type AdminScope } from "@/lib/adminScope";
import type { AdminSectionKey } from "@/lib/adminNav";

export type AdminContext = {
  // Named `id`, not `userId`, so it reads the same as the Supabase `User`
  // this replaced at 80-odd call sites -- `adminUser.id` means one thing in
  // this codebase and renaming it here would have meant 51 mechanical edits
  // whose only purpose was to say the same word differently.
  id: string;
  email: string | null;
  scope: AdminScope;
};

/**
 * Returns the signed-in user if they're an active admin, otherwise null.
 *
 * `active` is checked here and nowhere else in the admin stack: every other
 * role is gated on it twice (the proxy for navigation, requireActiveProfile
 * inside the API routes), but the admin branch checked role alone -- so
 * suspending an admin took away their sidebar and left their session cookie
 * able to POST every admin route, including the ones that move money.
 *
 * `approved` is deliberately NOT checked. An admin is promoted by hand in
 * Supabase rather than passing through the signup queue, so an existing
 * admin's `approved` may legitimately be false; gating on it would lock out
 * the people this is meant to protect. `active` is the suspension flag and
 * the only one that means anything for this role.
 */
export async function getAdminUser() {
  const result = await getAdminContextResult();
  return result.ok ? result.user : null;
}

/**
 * Why an admin check did not pass -- three answers, not one.
 *
 * Every guard in this file used to collapse all of them into `null`, and the
 * routes turned that into a flat 403 "Forbidden". Two of the three are not
 * refusals at all:
 *
 * - `unauthenticated` -- there is no usable session. The commonest cause is
 *   not a stranger but a **token refresh race**: this dashboard fires many
 *   requests at once, Supabase rotates refresh tokens, and a request that
 *   presents one another has just rotated gets a 401. Reported as
 *   "Forbidden" that reads as "you are not allowed to create accounts",
 *   which is both false and unactionable; reported honestly it is a session
 *   to re-establish, and the very next request usually has one.
 * - `unavailable` -- the check itself failed. The profile read's error used
 *   to be discarded, so a transient database blip was indistinguishable from
 *   "you are not an admin". Same rule as the delete that removed nothing:
 *   a check that could not be completed must never be reported as a check
 *   that came back negative.
 * - `forbidden` -- genuinely not an admin, suspended, or the wrong scope.
 *   This one stays deliberately opaque, so a limited admin probing routes
 *   still cannot map what exists beyond their access.
 */
export type AdminGuardReason = "unauthenticated" | "unavailable" | "forbidden";

export type AdminGuardResult =
  | { ok: true; user: User; context: AdminContext }
  | { ok: false; reason: AdminGuardReason };

export async function getAdminContextResult(): Promise<AdminGuardResult> {
  const supabase = await createClient();
  // An error here is the refresh race above; no error and no user is an
  // ordinary signed-out request. Both read the same way to the caller --
  // "sign in again" -- and neither is a statement about what this person is
  // allowed to do, which is the whole reason they no longer share an answer
  // with the refusals below.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (!user) return { ok: false, reason: "unauthenticated" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // A row that genuinely is not there comes back as PGRST116 from
    // `.single()`, which is a real answer: no profile, not an admin.
    // Anything else is the read failing, and the caller must be able to
    // retry rather than be told they are not allowed.
    if (profileError.code !== "PGRST116") return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "forbidden" };
  }

  if (profile?.role !== "admin") return { ok: false, reason: "forbidden" };
  if (profile.active === false) return { ok: false, reason: "forbidden" };

  // `admin_scope` is a new, migration-dependent column, so it is read in its
  // own isolated call and defaulted rather than added to the select above --
  // on a database that has not re-run schema.sql, an unknown-column error
  // here would otherwise lock every admin out of every admin route at once.
  // See the migration-dependent column rule in AGENTS.md. That is also why a
  // failure here is not `unavailable`: defaulting is the correct answer.
  const { data: scopeRow } = await supabase
    .from("profiles")
    .select("admin_scope")
    .eq("id", user.id)
    .maybeSingle();

  return {
    ok: true,
    user,
    context: {
      id: user.id,
      email: user.email ?? null,
      scope: parseAdminScope(scopeRow?.admin_scope),
    },
  };
}

/**
 * The admin plus their scope, or null. The shape 99 routes already take;
 * `getAdminContextResult()` above is the same check with the reason kept,
 * for a route that can act on the difference.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const result = await getAdminContextResult();
  return result.ok ? result.context : null;
}

/**
 * Guard for a route that belongs to one dashboard section. Returns the admin
 * context, or null when the caller is not an admin *or* their scope doesn't
 * cover that section -- both answer the same way on purpose, so a limited
 * admin probing routes can't map what exists beyond their access.
 *
 * The sidebar hides sections a scope can't open, but that is presentation
 * only: a session cookie can call any route directly, so this check is what
 * actually enforces it.
 *
 * **It asks for `manage`, not merely "can open".** Every route guarded by
 * this one is a POST that changes something, and that is what makes a
 * `view` grant real rather than a label: a scope that reads a section is
 * refused by all 98 of these without one of them being edited, so the level
 * cannot be widened by a screen forgetting to hide a button. A read-only
 * route, should this app ever grow one, wants `scopeCanOpen` and its own
 * guard rather than a looser version of this.
 */
export async function requireAdminScope(
  section: AdminSectionKey
): Promise<AdminContext | null> {
  const context = await getAdminContext();
  if (!context) return null;
  if (!scopeCanManage(context.scope, section)) return null;
  return context;
}
