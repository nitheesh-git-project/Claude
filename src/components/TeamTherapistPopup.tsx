"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import AvatarThumbnail from "@/components/profile/AvatarThumbnail";
import { Stagger, StaggerItem } from "@/components/motion/primitives";

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

const EASE = [0.16, 1, 0.3, 1] as const;

/** Splits the free-text languages column into individual chips. */
function languageList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,/|]/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function Rating({ avg, count }: { avg: number | null; count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
      <i aria-hidden="true" className="fa-solid fa-star" />
      {Number(avg).toFixed(1)}
      <span className="font-normal text-slate-500">
        ({count} review{count === 1 ? "" : "s"})
      </span>
    </span>
  );
}

/**
 * Specialist roster. Cards open a detail modal rather than a separate page,
 * so a visitor comparing therapists never loses their place in the list.
 *
 * The modal implements the usual dialog contract by hand — labelled,
 * Escape to close, focus moved in on open and restored on close, and
 * background scroll locked while it is up.
 */
export default function TeamTherapistPopup({ therapists }: { therapists: TeamTherapist[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = therapists.find((t) => t.id === openId) ?? null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.();
    };
  }, [open, close]);

  return (
    <>
      <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {therapists.map((t) => {
          const langs = languageList(t.languages);
          return (
            <StaggerItem key={t.id} className="h-full">
              <motion.button
                type="button"
                onClick={() => setOpenId(t.id)}
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                aria-haspopup="dialog"
                className="group flex h-full w-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-shadow hover:border-teal-300 hover:shadow-xl hover:shadow-slate-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-start gap-4">
                  <span className="relative shrink-0">
                    <AvatarThumbnail
                      url={t.avatar_url}
                      name={t.full_name ?? "Therapist"}
                      size={72}
                    />
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-teal-600 text-[10px] text-white"
                    >
                      <i className="fa-solid fa-check" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-display block truncate text-lg font-bold text-slate-900">
                      {t.full_name}
                    </span>
                    {t.credentials && (
                      <span className="mt-0.5 block text-xs font-semibold text-teal-700">
                        {t.credentials}
                      </span>
                    )}
                    <span className="mt-1.5 block">
                      <Rating avg={t.avg_rating} count={t.rating_count} />
                    </span>
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Experience
                    </dt>
                    <dd className="font-display mt-0.5 text-sm font-bold text-slate-900">
                      {t.years_experience != null ? `${t.years_experience}+ yrs` : "—"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Languages
                    </dt>
                    <dd className="mt-0.5 truncate text-sm font-medium text-slate-700">
                      {langs.length ? langs.join(", ") : "—"}
                    </dd>
                  </div>
                </dl>

                {t.specialization && (
                  <p className="mt-4 text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-700">Focus:</span>{" "}
                    {t.specialization}
                  </p>
                )}

                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-xs font-semibold text-teal-700">
                  View full profile
                  <i
                    aria-hidden="true"
                    className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover:translate-x-1"
                  />
                </span>
              </motion.button>
            </StaggerItem>
          );
        })}
      </Stagger>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={close}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="therapist-modal-name"
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.28, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            >
              {/* Header */}
              <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-br from-teal-800 to-emerald-700 px-6 pb-8 pt-7 sm:px-8">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
                />
                <button
                  ref={closeRef}
                  onClick={close}
                  aria-label="Close profile"
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <i aria-hidden="true" className="fa-solid fa-xmark" />
                </button>

                <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                  <span className="shrink-0 rounded-2xl bg-white/15 p-1.5 ring-1 ring-white/25">
                    <AvatarThumbnail
                      url={open.avatar_url}
                      name={open.full_name ?? "Therapist"}
                      size={104}
                    />
                  </span>
                  <div className="min-w-0">
                    <h3
                      id="therapist-modal-name"
                      className="font-display text-2xl font-extrabold text-white sm:text-3xl"
                    >
                      {open.full_name}
                    </h3>
                    {open.credentials && (
                      <p className="mt-1 text-sm font-semibold text-teal-100">
                        {open.credentials}
                      </p>
                    )}
                    {open.rating_count > 0 && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
                        <i aria-hidden="true" className="fa-solid fa-star text-amber-300" />
                        {Number(open.avg_rating).toFixed(1)} from {open.rating_count} review
                        {open.rating_count === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-6 sm:px-8">
                {/* Trust indicators */}
                <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Experience
                    </dt>
                    <dd className="font-display mt-1 text-base font-bold text-slate-900">
                      {open.years_experience != null ? `${open.years_experience}+ years` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Verification
                    </dt>
                    <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-teal-700">
                      <i aria-hidden="true" className="fa-solid fa-circle-check" />
                      Licensed
                    </dd>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Sessions
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">
                      1-on-1, 60 minutes
                    </dd>
                  </div>
                </dl>

                {open.specialization && (
                  <section className="mt-6">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                      Treatment focus
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      Specialist in {open.specialization}.
                    </p>
                  </section>
                )}

                {languageList(open.languages).length > 0 && (
                  <section className="mt-6">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                      Languages
                    </h4>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {languageList(open.languages).map((l) => (
                        <li
                          key={l}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                        >
                          {l}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {open.bio && (
                  <section className="mt-6">
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                      About
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{open.bio}</p>
                  </section>
                )}

                {open.public_display_note && (
                  <p className="mt-5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-relaxed text-teal-900">
                    {open.public_display_note}
                  </p>
                )}

                {!open.bio && !open.public_display_note && !open.specialization && (
                  <p className="mt-6 text-xs text-slate-400">
                    No additional details provided yet.
                  </p>
                )}

                {/* CTA */}
                <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Sessions are matched to the right specialist at booking.
                  </p>
                  <Link
                    href="/book"
                    onClick={close}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                  >
                    <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                    Book an assessment
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
