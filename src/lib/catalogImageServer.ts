import type { SupabaseClient } from "@supabase/supabase-js";
import { clampFocal } from "@/lib/catalogImage";

/**
 * Writes a cover's focal point, on its own.
 *
 * `image_focal_x` / `image_focal_y` are the newest columns on the three
 * catalog tables, so they follow the same rule `treatment_categories.specialty`
 * does: written in an isolated call rather than folded into the row above it.
 * A database one apply behind would otherwise refuse the *entire* edit —
 * price, title, everything — rather than losing one optional position, and an
 * admin would be told their catalogue could not be saved with nothing on
 * screen explaining why.
 *
 * Best-effort by the same reasoning: a failure here leaves the picture
 * centred, which is exactly where it was. It never throws, so it cannot take
 * down the save it is attached to.
 */
export async function writeCatalogFocal(
  admin: SupabaseClient,
  table: "treatment_categories" | "treatment_category_packages" | "home_visit_packages",
  rowId: string,
  focalX: unknown,
  focalY: unknown
): Promise<void> {
  try {
    await admin
      .from(table)
      .update({
        image_focal_x: clampFocal(focalX),
        image_focal_y: clampFocal(focalY),
      })
      .eq("id", rowId);
  } catch {
    // Swallowed on purpose — see above.
  }
}
