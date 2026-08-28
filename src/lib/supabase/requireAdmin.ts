import { createClient } from "@/lib/supabase/server";
import { parseAdminScope, scopeCanOpen, type AdminScope } from "@/lib/adminScope";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  if (profile.active === false) return null;
  return user;
}

/**
 * The admin plus their scope. `admin_scope` is a new, migration-dependent
 * column, so it's read in its own isolated call and defaulted rather than
 * added to the role select above -- on a database that hasn't re-run
 * schema.sql, an unknown-column error here would otherwise lock every admin
 * out of every admin route at once. See the migration-dependent column rule
 * in AGENTS.md.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const user = await getAdminUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: scopeRow } = await supabase
    .from("profiles")
    .select("admin_scope")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    scope: parseAdminScope(scopeRow?.admin_scope),
  };
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
 */
export async function requireAdminScope(
  section: AdminSectionKey
): Promise<AdminContext | null> {
  const context = await getAdminContext();
  if (!context) return null;
  if (!scopeCanOpen(context.scope, section)) return null;
  return context;
}
