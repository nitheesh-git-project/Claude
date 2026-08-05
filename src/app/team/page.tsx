import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import TeamTherapistPopup, { type TeamTherapist } from "@/components/TeamTherapistPopup";
import { Reveal } from "@/components/motion/primitives";

export const metadata: Metadata = {
  title: "Specialist Team | Dr. Pooja's Physio",
  description:
    "Meet our licensed clinical specialists — certified physical therapy professionals dedicated to global virtual care.",
};

// No per-user content on this page — cache and revalidate on a timer
// instead of hitting Supabase on every single visit. Reads from the
// public_therapist_profiles view, which already excludes anything
// non-public (email, phone, etc.) — see schema.sql.
export const revalidate = 300;

// languages/public_display_note are new/migration-dependent columns on the
// public_therapist_profiles view (see schema.sql's Feature 38 section) --
// selecting them errors outright against the view's pre-migration column
// list (unlike a plain table, a view can't silently return null for a
// column it was never defined with), so this falls back to the original
// column list on error rather than breaking the whole page.
const FULL_SELECT =
  "id, full_name, credentials, specialization, years_experience, bio, languages, avatar_url, avg_rating, rating_count, public_display_note";
const BASE_SELECT =
  "id, full_name, credentials, specialization, years_experience, bio, avatar_url, avg_rating, rating_count";

export default async function TeamPage() {
  const supabase = createPublicClient();
  let { data: therapists } = await supabase
    .from("public_therapist_profiles")
    .select(FULL_SELECT)
    .order("full_name", { ascending: true })
    .returns<TeamTherapist[]>();
  if (!therapists) {
    const fallback = await supabase
      .from("public_therapist_profiles")
      .select(BASE_SELECT)
      .order("full_name", { ascending: true })
      .returns<TeamTherapist[]>();
    therapists = fallback.data;
  }

  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Reveal className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="font-display text-3xl font-bold text-slate-900">
          Meet Our Licensed Clinical Specialists
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Certified physical therapy professionals dedicated to global
          virtual care.
        </p>
      </Reveal>

      {!therapists || therapists.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">
          Our specialist roster is being updated — check back shortly.
        </p>
      ) : (
        <TeamTherapistPopup therapists={therapists} />
      )}
    </section>
  );
}
