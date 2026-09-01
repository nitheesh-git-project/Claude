"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";
import CatalogImage from "@/components/catalog/CatalogImage";
import Modal, { useLastNonNull } from "@/components/Modal";
import {
  CheckList,
  ProseSection,
  SavingsMeter,
  SessionDots,
  StatTiles,
  rupees,
  type StatTile,
} from "@/components/catalog/CatalogVisuals";
import { computePackageSavings } from "@/lib/packageProgress";
import { PROGRAMME_CARD_NOTE } from "@/lib/consultationFirst";

export type PublicPackage = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  promises: unknown;
  badge_label: string | null;
  highlight: boolean;
  session_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  validity_days: number | null;
  therapist_locked: boolean;
  category_price_paise: number | null;
  // Detail-only columns, fetched by the page in their own isolated query
  // (see the callers) so a database that has not run the latest schema.sql
  // still renders the section -- just without these fields. Optional here
  // for the same reason.
  description?: string | null;
  terms?: string | null;
  package_code?: string | null;
  session_duration_minutes?: number | null;
  min_gap_hours?: number | null;
  max_sessions_per_week?: number | null;
  max_purchases_per_patient?: number | null;
};

// Rendered on both / (visible_on_home) and /conditions (visible_on_conditions)
// -- both callers filter the rows they pass in before this component ever
// sees them, so this stays a pure display component with no visibility
// logic of its own.
//
// A card opens the detail dialog rather than linking straight to checkout:
// a package is a several-thousand-rupee commitment with rules attached
// (validity, one therapist, scheduling limits), and none of that fits on a
// card. Booking stays one explicit tap away on the card itself, so the
// visitor who already knows what they want never has to read the dialog.
export default function SessionPackages({ packages }: { packages: PublicPackage[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = packages.find((p) => p.id === openId) ?? null;

  if (packages.length === 0) return null;

  return (
    <div id="packages" className="scroll-mt-28 border-y border-slate-100 bg-slate-50 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
            Session packages
          </span>
          <h2 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
            A programme, not just a booking
          </h2>
          <p className="mt-3 text-sm text-slate-600">
            Buy a bundle of sessions upfront at a lower per-session price — the
            same therapist runs your whole programme.
          </p>
        </Reveal>

        <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => {
            const promises = Array.isArray(pkg.promises) ? (pkg.promises as string[]) : [];
            const savings = computePackageSavings({
              sessionCount: pkg.session_count,
              pricePaise: pkg.price_paise,
              compareAtPaise: pkg.compare_at_paise,
              categoryPricePaise: pkg.category_price_paise,
            });
            return (
              <StaggerItem key={pkg.id} className="h-full">
                <motion.div
                  whileHover={{ y: -6 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-xl hover:shadow-slate-900/5 ${
                    pkg.highlight
                      ? "border-teal-300 ring-2 ring-teal-100"
                      : "border-slate-200 hover:border-teal-300"
                  }`}
                >
                  {pkg.badge_label && (
                    <span className="absolute right-4 top-4 z-10 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                      {pkg.badge_label}
                    </span>
                  )}

                  {/* Everything informational is one tap target that opens the
                      dialog. The booking link sits outside it -- a link nested
                      inside a button is invalid and behaves differently across
                      browsers. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(pkg.id)}
                    aria-haspopup="dialog"
                    className="flex flex-1 cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
                  >
                    <CatalogImage src={pkg.image_url} icon="fa-layer-group" className="h-40" />

                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {pkg.title}
                      </h3>
                      {pkg.subtitle && (
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                          {pkg.subtitle}
                        </p>
                      )}

                      {promises.length > 0 && (
                        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                          {promises.slice(0, 4).map((p) => (
                            <li
                              key={p}
                              className="flex items-start gap-2 text-xs leading-snug text-slate-700"
                            >
                              <i className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      )}

                      {pkg.therapist_locked && (
                        <p className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
                          <i className="fa-solid fa-user-doctor" /> One therapist for your whole
                          programme
                        </p>
                      )}

                      <div className="mt-auto border-t border-slate-100 pt-5">
                        <p className="text-xs text-slate-500">{pkg.session_count} sessions</p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-2xl font-bold text-slate-900">
                            {rupees(pkg.price_paise)}
                          </span>
                          {savings.compareAtPaise !== null && (
                            <span className="text-sm text-slate-400 line-through">
                              {rupees(savings.compareAtPaise)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {rupees(savings.perSessionPaise)} / session
                          {savings.savingsPercent !== null && (
                            <span className="ml-1.5 font-semibold text-teal-700">
                              Save {savings.savingsPercent}%
                            </span>
                          )}
                        </p>
                        {pkg.validity_days && (
                          <p className="mt-1 text-[11px] text-slate-400">
                            Valid for {pkg.validity_days} days from purchase
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-col gap-2 px-6 pb-6">
                    {/* Not a Buy button any more. A programme is arranged by
                        a therapist after they have seen someone, so the card
                        shows what one looks like and the CTA starts the only
                        step a visitor can take themselves. */}
                    <Link
                      href="/book"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    >
                      <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                      Book a first session
                    </Link>
                    <p className="text-center text-[11px] text-slate-400">
                      {PROGRAMME_CARD_NOTE}
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenId(pkg.id)}
                      aria-haspopup="dialog"
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    >
                      View full details
                      <i
                        aria-hidden="true"
                        className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover:translate-x-1"
                      />
                    </button>
                  </div>
                </motion.div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>

      <PackageDetail pkg={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PackageDetail({
  pkg: selected,
  onClose,
}: {
  pkg: PublicPackage | null;
  onClose: () => void;
}) {
  // Held through the close animation so the panel does not empty out mid-fade.
  const pkg = useLastNonNull(selected);
  const promises = pkg && Array.isArray(pkg.promises) ? (pkg.promises as string[]) : [];
  const savings = pkg
    ? computePackageSavings({
        sessionCount: pkg.session_count,
        pricePaise: pkg.price_paise,
        compareAtPaise: pkg.compare_at_paise,
        categoryPricePaise: pkg.category_price_paise,
      })
    : null;

  const stats: StatTile[] = [];
  if (pkg && savings) {
    stats.push({
      label: "Sessions",
      value: `${pkg.session_count} × ${pkg.session_duration_minutes ?? 60} min`,
      icon: "fa-video",
    });
    stats.push({
      label: "Per session",
      value: rupees(savings.perSessionPaise),
      icon: "fa-tag",
    });
    if (pkg.validity_days) {
      stats.push({
        label: "Validity",
        value: `${pkg.validity_days} days`,
        icon: "fa-hourglass-half",
      });
    }
    stats.push({
      label: "Therapist",
      value: pkg.therapist_locked ? "Same throughout" : "Assigned per session",
      icon: "fa-user-doctor",
    });
    if (pkg.max_sessions_per_week) {
      stats.push({
        label: "Pace",
        value: `Up to ${pkg.max_sessions_per_week}/week`,
        icon: "fa-calendar-week",
      });
    }
    if (pkg.min_gap_hours) {
      stats.push({
        label: "Minimum gap",
        value: `${pkg.min_gap_hours} hours`,
        icon: "fa-clock",
      });
    }
  }

  return (
    <Modal
      open={selected !== null}
      onClose={onClose}
      labelledBy="package-modal-title"
      closeLabel="Close package details"
      closeTone={pkg?.image_url ? "dark" : "light"}
    >
      {pkg && savings && (
        <>
          {pkg.image_url ? (
            <div className="relative h-48 w-full overflow-hidden sm:h-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pkg.image_url} alt="" className="h-full w-full object-cover" />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-slate-950/10"
              />
              <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 sm:px-8">
                <PackageHeading pkg={pkg} tone="dark" />
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-teal-800 to-emerald-700 px-6 pb-7 pt-8 sm:px-8">
              <PackageHeading pkg={pkg} tone="dark" />
            </div>
          )}

          <div className="px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold text-slate-900">
                    {rupees(pkg.price_paise)}
                  </span>
                  {savings.compareAtPaise !== null && (
                    <span className="text-base text-slate-400 line-through">
                      {rupees(savings.compareAtPaise)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Paid once, upfront — nothing further per session.
                </p>
              </div>
              <SessionDots count={pkg.session_count} unitLabel="sessions" />
            </div>

            <div className="mt-6">
              <SavingsMeter
                perUnitPaise={savings.perSessionPaise}
                comparePerUnitPaise={
                  savings.compareAtPaise === null
                    ? null
                    : Math.round(savings.compareAtPaise / pkg.session_count)
                }
                savingsPercent={savings.savingsPercent}
                unitLabel="session"
              />
            </div>

            <div className="mt-6">
              <StatTiles items={stats} />
            </div>

            <ProseSection title="About this package" body={pkg.description} />
            <CheckList items={promises} title="What's included" />

            {pkg.therapist_locked && (
              <p className="mt-6 flex items-start gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-relaxed text-teal-900">
                <i aria-hidden="true" className="fa-solid fa-user-doctor mt-0.5 text-teal-700" />
                The therapist who takes your first session stays with you for the rest of the
                programme, so nobody re-reads your history mid-course.
              </p>
            )}

            {pkg.max_purchases_per_patient && (
              <p className="mt-3 text-xs text-slate-500">
                Limit {pkg.max_purchases_per_patient} purchase
                {pkg.max_purchases_per_patient === 1 ? "" : "s"} per patient.
              </p>
            )}

            <ProseSection title="Terms" body={pkg.terms} />

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{PROGRAMME_CARD_NOTE}</p>
              <Link
                href="/book"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                Book a first session
              </Link>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function PackageHeading({ pkg, tone }: { pkg: PublicPackage; tone: "dark" | "light" }) {
  const muted = tone === "dark" ? "text-teal-100" : "text-slate-600";
  return (
    <>
      {pkg.badge_label && (
        <span className="mb-2 inline-block rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
          {pkg.badge_label}
        </span>
      )}
      <h3
        id="package-modal-title"
        className={`font-display text-2xl font-extrabold sm:text-3xl ${
          tone === "dark" ? "text-white" : "text-slate-900"
        }`}
      >
        {pkg.title}
      </h3>
      {pkg.subtitle && <p className={`mt-1.5 text-sm ${muted}`}>{pkg.subtitle}</p>}
    </>
  );
}
