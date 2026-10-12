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

export type ConditionCover = {
  title: string;
  src: string | null;
  focalX: number | null;
  focalY: number | null;
};

/**
 * The condition photographs a patient's programmes and recommendations are
 * drawn with, keyed by `treatment_categories.id`.
 *
 * A recommended programme is bought against a hidden "course" package row
 * that carries no photo of its own, so every screen showing what the patient
 * bought fell back to a placeholder - the photo they had just seen on the
 * recommendation vanished the moment they paid. The condition is the one
 * thing both ends share, so its cover is the answer.
 *
 * The focal columns are read in their own call, for the migration-tolerance
 * reason `writeCatalogFocal` gives: a database one apply behind loses the
 * positions, never the photographs. Inactive conditions are included - a
 * programme outlives its condition being taken off sale.
 */
export async function loadConditionCovers(
  admin: SupabaseClient,
  categoryIds: (string | null | undefined)[]
): Promise<Map<string, ConditionCover>> {
  const ids = [...new Set(categoryIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  const covers = new Map<string, ConditionCover>();
  if (ids.length === 0) return covers;
  const [{ data: rows }, { data: focals }] = await Promise.all([
    admin.from("treatment_categories").select("id, title, image_url").in("id", ids),
    admin.from("treatment_categories").select("id, image_focal_x, image_focal_y").in("id", ids),
  ]);
  const focalById = new Map(
    ((focals ?? []) as { id: string; image_focal_x: number | null; image_focal_y: number | null }[]).map((f) => [f.id, f])
  );
  for (const r of (rows ?? []) as { id: string; title: string; image_url: string | null }[]) {
    const f = focalById.get(r.id);
    covers.set(r.id, {
      title: r.title,
      src: r.image_url,
      focalX: f?.image_focal_x ?? null,
      focalY: f?.image_focal_y ?? null,
    });
  }
  return covers;
}
