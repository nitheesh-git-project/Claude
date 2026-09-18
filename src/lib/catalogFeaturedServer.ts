import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Writes whether a catalog row is featured on the public pages, on its own.
 *
 * `featured` is the newest column on both catalog tables, so it follows the
 * rule `writeSpecialty` and `writeCatalogFocal` already do: an isolated call
 * rather than a field folded into the row above it. A database one apply
 * behind would otherwise refuse the *entire* edit -- title, price,
 * everything -- rather than losing one optional flag, and an admin would be
 * told their catalogue could not be saved with nothing on screen explaining
 * why.
 *
 * Best-effort by the same reasoning: a failure leaves the row exactly as
 * featured as it already was, which is a page that looks unchanged rather
 * than a save that failed. It never throws, so it cannot take down the edit
 * it is attached to.
 */
export async function writeCatalogFeatured(
  admin: SupabaseClient,
  table: "treatment_categories" | "home_visit_packages",
  rowId: string,
  featured: unknown
): Promise<void> {
  try {
    await admin.from(table).update({ featured: featured === true }).eq("id", rowId);
  } catch {
    // Swallowed on purpose -- see above.
  }
}
