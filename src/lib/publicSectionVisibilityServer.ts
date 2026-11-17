import { createPublicClient } from "@/lib/supabase/public";
import {
  ALL_PUBLIC_SECTIONS_SHOWN,
  PUBLIC_SECTION_COLUMNS,
  parsePublicSectionVisibility,
  type PublicSectionVisibility,
} from "@/lib/publicSectionVisibility";

/** The three public-section switches, from their own isolated read (see
 *  publicSectionVisibility.ts). Never throws; a failed read shows all. */
export async function readPublicSectionVisibility(): Promise<PublicSectionVisibility> {
  try {
    const { data, error } = await createPublicClient()
      .from("site_settings")
      .select(PUBLIC_SECTION_COLUMNS)
      .limit(1)
      .maybeSingle();
    if (error) return ALL_PUBLIC_SECTIONS_SHOWN;
    return parsePublicSectionVisibility(data as Record<string, unknown> | null);
  } catch {
    return ALL_PUBLIC_SECTIONS_SHOWN;
  }
}
