import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";

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

export default async function TeamPage() {
  const supabase = createPublicClient();
  const { data: therapists } = await supabase
    .from("public_therapist_profiles")
    .select(
      "id, full_name, credentials, specialization, years_experience, bio, avatar_url, avg_rating, rating_count"
    )
    .order("full_name", { ascending: true });

  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl font-bold text-slate-900">
          Meet Our Licensed Clinical Specialists
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Certified physical therapy professionals dedicated to global
          virtual care.
        </p>
      </div>

      {!therapists || therapists.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">
          Our specialist roster is being updated — check back shortly.
        </p>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {therapists.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
            >
              <AvatarThumbnail
                url={t.avatar_url}
                name={t.full_name ?? "Therapist"}
                size={80}
                className="mb-4"
              />
              <h3 className="text-xl font-bold text-slate-900">{t.full_name}</h3>
              {t.rating_count > 0 && (
                <p className="text-xs font-semibold text-amber-600 mt-1">
                  <i className="fa-solid fa-star mr-1"></i>
                  {Number(t.avg_rating).toFixed(1)} ({t.rating_count} review
                  {t.rating_count === 1 ? "" : "s"})
                </p>
              )}
              {t.credentials && (
                <p className="text-xs font-semibold text-teal-700 mt-1">{t.credentials}</p>
              )}
              {t.specialization && (
                <p className="text-xs text-slate-500 mt-1">
                  Specialist in {t.specialization}
                </p>
              )}
              {t.years_experience !== null && t.years_experience !== undefined && (
                <p className="text-xs text-slate-500 mt-1">
                  {t.years_experience}+ years of experience
                </p>
              )}
              {t.bio && (
                <p className="text-xs text-slate-600 mt-3 leading-relaxed">{t.bio}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
