import type { SupabaseClient } from "@supabase/supabase-js";
import { clampFocal } from "@/lib/catalogImage";

/**
 * Writes a cover's focal point, on its own.
 *
 * `image_focal_x` / `image_focal_y` are the newest columns on the three
 * catalog tables, so they follow the same rule `treatment_categories.specialty`
 * does: written in an isolated call rather than folded into the row above it.
 * A database one apply behind would otherwise refuse the *entire* edit -
 * price, title, everything - rather than losing one optional position, and an
 * admin would be told their catalogue could not be saved with nothing on
 * screen explaining why.
 *
 * Best-effort by the same reasoning: a failure here leaves the picture
 * centred, which is exactly where it was. It never throws, so it cannot take
 * down the save it is attached to.
 *
 * **It reports, though.** Swallowing the failure silently meant an admin drags
 * a cover's focal point, is told the catalogue saved, and the picture does not
 * move -- which is the "never tell somebody they did something they did not
 * do" rule, on the one part of this save a person can see. The boolean lets
 * the route say so; nothing is refused and nothing is rolled back.
 */
export async function writeCatalogFocal(
  admin: SupabaseClient,
  table: "treatment_categories" | "treatment_category_packages" | "home_visit_packages",
  rowId: string,
  focalX: unknown,
  focalY: unknown
): Promise<boolean> {
  try {
    const { error } = await admin
      .from(table)
      .update({
        image_focal_x: clampFocal(focalX),
        image_focal_y: clampFocal(focalY),
      })
      .eq("id", rowId);
    if (error) {
      console.error("Could not write a catalog cover's focal point", table, rowId, error.message);
      return false;
    }
    return true;
  } catch (err) {
    // Never rethrown -- see above. Reported so the caller can say so.
    console.error("Writing a catalog cover's focal point threw", table, rowId, err);
    return false;
  }
}
