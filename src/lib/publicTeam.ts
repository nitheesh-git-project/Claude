import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { teamInitials } from "@/lib/teamInitials";

/**
 * Who is publicly on /team, for the surfaces that would otherwise advertise a
 * team page with nobody on it (the nav, the footer, the Explore tiles) or draw
 * people who are not there (the avatar stack on Why choose us).
 *
 * `public_therapist_profiles` already requires approved + active + visible, so
 * this is exactly what /team renders. A failed read is "could not check", not
 * "nobody": the page stays linked (`known: false` keeps `hasTeam` true) rather
 * than a transient error removing a real team from the nav.
 */
export const readPublicTeam = cache(
  async (): Promise<{ hasTeam: boolean; initials: string[] }> => {
    try {
      const { data, error } = await createPublicClient()
        .from("public_therapist_profiles")
        .select("full_name")
        .order("full_name", { ascending: true })
        .limit(12);
      if (error) return { hasTeam: true, initials: [] };
      const names = (data ?? []).map((r) => r.full_name as string | null);
      return { hasTeam: names.length > 0, initials: teamInitials(names) };
    } catch {
      return { hasTeam: true, initials: [] };
    }
  }
);
