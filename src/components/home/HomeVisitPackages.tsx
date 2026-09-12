"use client";

import { useState } from "react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import CatalogCard from "@/components/catalog/CatalogCard";
import CatalogDialogHeader from "@/components/catalog/CatalogDialogHeader";
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
  /** Migration-dependent, so optional: a caller reading a database
   *  without them hands through undefined and the cover centres. */
  image_focal_x?: number | null;
  image_focal_y?: number | null;
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

        // Facts that were only readable by opening the dialog. Each one is
        // dropped where the row has nothing to say, which is what lets the
        // single-visit card and the multi-visit one share a component.
        const meta = [
          isSingle ? "Single visit" : `${pkg.visit_count} visits`,
          `${pkg.visit_duration_minutes} min${isSingle ? "" : " each"}`,
          pkg.travel_fee_included ? "Travel included" : "Travel by area",
          !isSingle && pkg.therapist_locked ? "Same therapist" : "",
          pkg.validity_days ? `Valid ${pkg.validity_days} days` : "",
        ].filter(Boolean);

        return (
          <StaggerItem key={pkg.id} className="h-full">
            <CatalogCard
              data={{
                id: pkg.id,
                title: pkg.title,
                summary: pkg.subtitle,
                imageUrl: pkg.image_url,
                focalX: pkg.image_focal_x,
                focalY: pkg.image_focal_y,
                badge: pkg.badge_label,
                highlight: pkg.highlight,
                meta,
                points: benefits,
                pricePaise: pkg.price_paise,
                compareAtPaise: savings.compareAtPaise,
                savingsPaise:
                  savings.compareAtPaise === null
                    ? null
                    : savings.compareAtPaise - pkg.price_paise,
                priceUnit: isSingle ? "/ visit" : `/ ${pkg.visit_count} visits`,
                bookHref: isSingle
                  ? `/book-home-visit?package=${pkg.id}`
                  : "/book-home-visit",
                bookLabel: isSingle ? "Book this visit" : "Book a first visit",
                icon: "fa-house-medical",
              }}
              onOpenDetails={() => setOpenId(pkg.id)}
            />
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
          {/* Nothing over the picture. This dialog used to lay the heading
              on the photograph behind a scrim, which meant every cover had to
              survive white text and the heading had to be sized to fight it.
              The same header the programme dialog uses now, so the two cannot
              drift apart again. */}
          <CatalogDialogHeader
            titleId="home-visit-package-modal-title"
            title={pkg.title}
            badge={pkg.badge_label}
            subtitle={pkg.subtitle}
            imageUrl={pkg.image_url}
            focalX={pkg.image_focal_x}
            focalY={pkg.image_focal_y}
            icon="fa-house-medical"
          />

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

