"use client";

import { useState } from "react";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";

export type TeamTherapist = {
  id: string;
  full_name: string | null;
  credentials: string | null;
  specialization: string | null;
  years_experience: number | null;
  bio: string | null;
  // New/migration-dependent columns on the public_therapist_profiles view
  // (see team/page.tsx's FULL_SELECT/BASE_SELECT fallback) -- optional so
  // this component still renders correctly before that migration runs.
  languages?: string | null;
  avatar_url: string | null;
  avg_rating: number | null;
  rating_count: number;
  public_display_note?: string | null;
};

// Specialist Team profile popup (Feature 38): the /team grid stays a plain
// card layout, but each card is now a button that opens the therapist's
// full profile as an overlay -- same backdrop-blur convention as every
// other pop-up in this app (ConfirmDialog, SessionDetailDrawer, the admin
// detail overlay) -- rather than the card itself trying to hold everything.
// public_display_note is admin-curated marketing copy (see
// TherapistDisplayContentForm), shown here alongside the therapist's own
// self-reported bio, not in place of it.
export default function TeamTherapistPopup({ therapists }: { therapists: TeamTherapist[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = therapists.find((t) => t.id === openId) ?? null;

  return (
    <>
      <div className="grid md:grid-cols-3 gap-8">
        {therapists.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpenId(t.id)}
            className="text-left bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-teal-300 transition cursor-pointer"
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
              <p className="text-xs text-slate-500 mt-1">Specialist in {t.specialization}</p>
            )}
            {t.years_experience !== null && t.years_experience !== undefined && (
              <p className="text-xs text-slate-500 mt-1">
                {t.years_experience}+ years of experience
              </p>
            )}
            {t.bio && (
              <p className="text-xs text-slate-600 mt-3 leading-relaxed line-clamp-3">{t.bio}</p>
            )}
            <p className="text-xs text-teal-700 font-semibold mt-4">View full profile →</p>
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <AvatarThumbnail url={open.avatar_url} name={open.full_name ?? "Therapist"} size={72} />
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{open.full_name}</h3>
                  {open.credentials && (
                    <p className="text-sm font-semibold text-teal-700 mt-0.5">{open.credentials}</p>
                  )}
                  {open.rating_count > 0 && (
                    <p className="text-xs font-semibold text-amber-600 mt-1">
                      <i className="fa-solid fa-star mr-1"></i>
                      {Number(open.avg_rating).toFixed(1)} ({open.rating_count} review
                      {open.rating_count === 1 ? "" : "s"})
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpenId(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {(open.specialization || open.years_experience !== null) && (
                <p className="text-slate-600">
                  {open.specialization && <>Specialist in {open.specialization}</>}
                  {open.specialization && open.years_experience !== null && <> • </>}
                  {open.years_experience !== null && open.years_experience !== undefined && (
                    <>{open.years_experience}+ years of experience</>
                  )}
                </p>
              )}
              {open.languages && (
                <p className="text-slate-500 text-xs">
                  <i className="fa-solid fa-language mr-1.5"></i>
                  Speaks {open.languages}
                </p>
              )}
              {open.bio && <p className="text-slate-700 leading-relaxed">{open.bio}</p>}
              {open.public_display_note && (
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                  <p className="text-teal-900 leading-relaxed">{open.public_display_note}</p>
                </div>
              )}
              {!open.bio && !open.public_display_note && (
                <p className="text-slate-400 text-xs">No additional details provided yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
