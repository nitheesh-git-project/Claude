"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
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
import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";
import { PROGRAMME_CARD_NOTE } from "@/lib/consultationFirst";

export type PublicHomeVisitPackage = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  benefits: unknown;
  badge_label: string | null;
  highlight: boolean;
  visit_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  visit_duration_minutes: number;
  validity_days: number | null;
  travel_fee_included: boolean;
  therapist_locked: boolean;
  // Detail-only columns, fetched by the page in their own isolated query so
  // a database missing them still renders the section. Optional for the
  // same reason.
  description?: string | null;
  terms?: string | null;
  min_gap_hours?: number | null;
  max_visits_per_week?: number | null;
  max_purchases_per_patient?: number | null;
};

// The public home-visit catalogue. A pure display component -- the caller
// filters, both on visibility and (since programmes stopped being sold from
// the public site) on visit count, so there is no filtering logic in this
// file -- following the same interaction contract as the programme cards:
// the card body opens the detail dialog, booking is its own button on the
// card and in the dialog.
//
// The multi-visit branches below are kept deliberately. Nothing reaches them
// while /home-visit filters to single visits, but this component takes
// whatever it is handed, and a card that sold a programme because a caller
// forgot to filter is a worse failure than an unused branch.
export default function HomeVisitPackages({
  packages,
}: {
  packages: PublicHomeVisitPackage[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = packages.find((p) => p.id === openId) ?? null;

  if (packages.length === 0) return null;

  return (
    <>
    <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => {
        const benefits = Array.isArray(pkg.benefits) ? (pkg.benefits as string[]) : [];
        const savings = computeHomeVisitSavings({
          visitCount: pkg.visit_count,
          pricePaise: pkg.price_paise,
          compareAtPaise: pkg.compare_at_paise,
        });
        const isSingle = pkg.visit_count === 1;

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
                  dialog; the booking link sits outside it, since a link
                  nested inside a button is invalid markup. */}
              <button
                type="button"
                onClick={() => setOpenId(pkg.id)}
                aria-haspopup="dialog"
                className="flex flex-1 cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
              >
              <CatalogImage src={pkg.image_url} icon="fa-house-medical" className="h-40" />

              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-lg font-bold text-slate-900">{pkg.title}</h3>
                {pkg.subtitle && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{pkg.subtitle}</p>
                )}

                {benefits.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {benefits.slice(0, 4).map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-xs leading-snug text-slate-700"
                      >
                        <i className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 space-y-1.5">
                  {pkg.travel_fee_included && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
                      <i className="fa-solid fa-car-side" /> Travel included — no extra charge
                    </p>
                  )}
                  {pkg.therapist_locked && !isSingle && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
                      <i className="fa-solid fa-user-doctor" /> One therapist for every visit
                    </p>
                  )}
                </div>

                <div className="mt-auto border-t border-slate-100 pt-5">
                  <p className="text-xs text-slate-500">
                    {isSingle ? "Single visit" : `${pkg.visit_count} visits`} ·{" "}
                    {pkg.visit_duration_minutes} min each
                  </p>
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
                  {/* Per-visit price is noise on a single visit -- it is the
                      same number as the total, printed twice. */}
                  {!isSingle && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {rupees(savings.perVisitPaise)} / visit
                      {savings.savingsPercent !== null && (
                        <span className="ml-1.5 font-semibold text-teal-700">
                          Save {savings.savingsPercent}%
                        </span>
                      )}
                    </p>
                  )}
                  {!pkg.travel_fee_included && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Travel charged separately, by area
                    </p>
                  )}
                  {pkg.validity_days && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Valid {pkg.validity_days} days from purchase
                    </p>
                  )}
                </div>
              </div>
              </button>

              <div className="flex flex-col gap-2 px-6 pb-6">
                {/* A single visit is the home-visit consultation and is
                    bought here; a course of visits is a therapist's
                    recommendation, so its card explains rather than sells.
                    Both routes refuse a programme regardless. */}
                <Link
                  href={isSingle ? `/book-home-visit?package=${pkg.id}` : "/book-home-visit"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                  {isSingle ? "Book this visit" : "Book a first visit"}
                </Link>
                {!isSingle && (
                  <p className="text-center text-[11px] text-slate-400">
                    {PROGRAMME_CARD_NOTE}
                  </p>
                )}
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

      <HomeVisitPackageDetail pkg={selected} onClose={() => setOpenId(null)} />
    </>
  );
}

function HomeVisitPackageDetail({
  pkg: selected,
  onClose,
}: {
  pkg: PublicHomeVisitPackage | null;
  onClose: () => void;
}) {
  // Held through the close animation so the panel does not empty out mid-fade.
  const pkg = useLastNonNull(selected);
  const benefits = pkg && Array.isArray(pkg.benefits) ? (pkg.benefits as string[]) : [];
  const savings = pkg
    ? computeHomeVisitSavings({
        visitCount: pkg.visit_count,
        pricePaise: pkg.price_paise,
        compareAtPaise: pkg.compare_at_paise,
      })
    : null;
  const isSingle = pkg?.visit_count === 1;

  const stats: StatTile[] = [];
  if (pkg && savings) {
    stats.push({
      label: "Visits",
      value: `${pkg.visit_count} × ${pkg.visit_duration_minutes} min`,
      icon: "fa-house-medical",
    });
    if (!isSingle) {
      stats.push({ label: "Per visit", value: rupees(savings.perVisitPaise), icon: "fa-tag" });
    }
    stats.push({
      label: "Travel",
      value: pkg.travel_fee_included ? "Included" : "Charged by area",
      icon: "fa-car-side",
    });
    if (pkg.validity_days) {
      stats.push({
        label: "Validity",
        value: `${pkg.validity_days} days`,
        icon: "fa-hourglass-half",
      });
    }
    if (!isSingle) {
      stats.push({
        label: "Therapist",
        value: pkg.therapist_locked ? "Same every visit" : "Assigned per visit",
        icon: "fa-user-doctor",
      });
    }
    if (pkg.max_visits_per_week) {
      stats.push({
        label: "Pace",
        value: `Up to ${pkg.max_visits_per_week}/week`,
        icon: "fa-calendar-week",
      });
    }
    if (pkg.min_gap_hours) {
      stats.push({ label: "Minimum gap", value: `${pkg.min_gap_hours} hours`, icon: "fa-clock" });
    }
  }

  return (
    <Modal
      open={selected !== null}
      onClose={onClose}
      labelledBy="home-visit-package-modal-title"
      closeLabel="Close package details"
      closeTone="dark"
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
                <HomeVisitHeading pkg={pkg} />
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-teal-800 to-emerald-700 px-6 pb-7 pt-8 sm:px-8">
              <HomeVisitHeading pkg={pkg} />
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
                  {pkg.travel_fee_included
                    ? "Travel to your address is included in this price."
                    : "A travel fee for your area is added at checkout."}
                </p>
              </div>
              {!isSingle && <SessionDots count={pkg.visit_count} unitLabel="visits" />}
            </div>

            {!isSingle && (
              <div className="mt-6">
                <SavingsMeter
                  perUnitPaise={savings.perVisitPaise}
                  comparePerUnitPaise={
                    savings.compareAtPaise === null
                      ? null
                      : Math.round(savings.compareAtPaise / pkg.visit_count)
                  }
                  savingsPercent={savings.savingsPercent}
                  unitLabel="visit"
                />
              </div>
            )}

            <div className="mt-6">
              <StatTiles items={stats} />
            </div>

            <ProseSection title="About this package" body={pkg.description} />
            <CheckList items={benefits} title="What's included" />

            <p className="mt-6 flex items-start gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-relaxed text-teal-900">
              <i aria-hidden="true" className="fa-solid fa-location-dot mt-0.5 text-teal-700" />
              We confirm your pincode is serviceable before anything is charged.
            </p>

            {pkg.max_purchases_per_patient && (
              <p className="mt-3 text-xs text-slate-500">
                Limit {pkg.max_purchases_per_patient} purchase
                {pkg.max_purchases_per_patient === 1 ? "" : "s"} per patient.
              </p>
            )}

            <ProseSection title="Terms" body={pkg.terms} />

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {isSingle
                  ? "Visits are scheduled after purchase, at times you pick."
                  : PROGRAMME_CARD_NOTE}
              </p>
              <Link
                href={isSingle ? `/book-home-visit?package=${pkg.id}` : "/book-home-visit"}
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                {isSingle ? "Book this visit" : "Book a first visit"}
              </Link>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function HomeVisitHeading({ pkg }: { pkg: PublicHomeVisitPackage }) {
  return (
    <>
      {pkg.badge_label && (
        <span className="mb-2 inline-block rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
          {pkg.badge_label}
        </span>
      )}
      <h3
        id="home-visit-package-modal-title"
        className="font-display text-2xl font-extrabold text-white sm:text-3xl"
      >
        {pkg.title}
      </h3>
      {pkg.subtitle && <p className="mt-1.5 text-sm text-teal-100">{pkg.subtitle}</p>}
    </>
  );
}
