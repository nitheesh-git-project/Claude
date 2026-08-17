import { createClient } from "@/lib/supabase/server";
import { parseAdminScope, scopeCanOpen, type AdminScope } from "@/lib/adminScope";
import type { AdminSectionKey } from "@/lib/adminNav";

export type AdminContext = {
  userId: string;
  email: string | null;
  scope: AdminScope;
};

/** Returns the signed-in user if they're an admin, otherwise null. */
export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
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
    userId: user.id,
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
