import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import TeamTherapistPopup, { type TeamTherapist } from "@/components/TeamTherapistPopup";
import { Reveal, FloatingOrbs } from "@/components/motion/primitives";

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
    <>
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-teal-50/70 to-white py-16">
        <FloatingOrbs />
        <Reveal className="relative mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="fa-solid fa-user-doctor text-teal-600" />
            Licensed clinical team
          </span>
          <h1 className="font-display mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            The specialists who will actually see you
          </h1>
          <p className="mt-4 text-base text-slate-600">
            Every session is delivered one-to-one by a qualified
            physiotherapist — tap any profile to read their background.
          </p>
        </Reveal>
      </div>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {!therapists || therapists.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Our specialist roster is being updated — check back shortly.
          </p>
        ) : (
          <TeamTherapistPopup therapists={therapists} />
        )}
      </section>
    </>
  );
}
