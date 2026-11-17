// Three public sections an admin can switch off without deleting what is in
// them: What We Promise, What We Will Not Do, and Testimonials (Settings ->
// Public Site). Each is a site_settings boolean, on by default.
//
// Read in its own query, never through SITE_SETTINGS_SELECT: the columns are
// new, and a database that has not run the migration must keep every
// section showing rather than fail the whole settings read (the same rule as
// every migration-dependent column here). A failed read shows all three --
// hiding content because a setting could not be read would be the wrong way
// round.

export const PUBLIC_SECTION_TOGGLES = [
  {
    key: "promises",
    column: "promises_section_visible",
    label: "What We Promise",
    where: "the promise headlines in the home page's mission band and the What We Promise section on Our Mission",
  },
  {
    key: "limits",
    column: "limits_section_visible",
    label: "What We Will Not Do",
    where: "the What We Won't Do section on Our Mission",
  },
  {
    key: "testimonials",
    column: "testimonials_section_visible",
    label: "Testimonials",
    where: "the patient stories on the home page and on Our Mission",
  },
] as const;

export type PublicSectionKey = (typeof PUBLIC_SECTION_TOGGLES)[number]["key"];
export type PublicSectionVisibility = Record<PublicSectionKey, boolean>;
export type PublicSectionColumn = (typeof PUBLIC_SECTION_TOGGLES)[number]["column"];

export const ALL_PUBLIC_SECTIONS_SHOWN: PublicSectionVisibility = {
  promises: true,
  limits: true,
  testimonials: true,
};

export const PUBLIC_SECTION_COLUMNS = PUBLIC_SECTION_TOGGLES.map((t) => t.column).join(", ");

/** A site_settings row (or nothing) as the three switches. Only an explicit
 *  false hides a section. */
export function parsePublicSectionVisibility(row: Record<string, unknown> | null | undefined): PublicSectionVisibility {
  const out = { ...ALL_PUBLIC_SECTIONS_SHOWN };
  for (const t of PUBLIC_SECTION_TOGGLES) {
    if (row?.[t.column] === false) out[t.key] = false;
  }
  return out;
}
