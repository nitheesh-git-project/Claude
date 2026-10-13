"use client";

import { useState } from "react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion/primitives";
import CatalogCard from "@/components/catalog/CatalogCard";
import CatalogDialogHeader from "@/components/catalog/CatalogDialogHeader";
import Modal, { useLastNonNull } from "@/components/Modal";
import { CheckList, ProseSection, StatTiles, rupees } from "@/components/catalog/CatalogVisuals";
import { homeVisitConditionOption, type HomeVisitConditionRow } from "@/lib/serviceOptions";
import { homeVisitBookHref } from "@/lib/homeVisitRates";

export type PublicHomeVisitCondition = HomeVisitConditionRow & {
  /** Whether the condition leads the page. */
  featured?: boolean | null;
};

// The public home-visit list: every condition the clinic treats, each as one
// visit at its home-visit price (Catalog -> Conditions -> Home visits -- the
// condition's own price, else the clinic-wide one). One visit, always: a
// course of visits is something a therapist recommends after seeing
// somebody, so nothing here carries a count, a validity or a day.
//
// A pure display component -- the page reads and prices the conditions --
// following the catalog interaction contract: the card body opens the
// detail dialog, booking is its own button on the card and in the dialog.
// The card and the dialog read the same `ServiceOption` the booking wizard's
// picker does (serviceOptions.ts), so the three cannot describe one visit
// three ways.
export default function HomeVisitConditions({
  conditions,
}: {
  conditions: PublicHomeVisitCondition[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = conditions.find((c) => c.id === openId) ?? null;

  if (conditions.length === 0) return null;

  return (
    <>
      <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {conditions.map((condition) => {
          const option = homeVisitConditionOption(condition);
          return (
            <StaggerItem key={condition.id} className="h-full">
              <CatalogCard
                data={{
                  id: option.id,
                  title: option.title,
                  summary: option.summary,
                  imageUrl: option.imageUrl,
                  focalX: option.focalX,
                  focalY: option.focalY,
                  meta: option.meta,
                  points: option.points,
                  pricePaise: option.pricePaise,
                  rupeesOnly: true,
                  priceUnit: option.priceUnit,
                  bookHref: homeVisitBookHref(condition.id),
                  bookLabel: "Book a home visit",
                  icon: option.icon,
                }}
                onOpenDetails={() => setOpenId(condition.id)}
              />
            </StaggerItem>
          );
        })}
      </Stagger>

      <HomeVisitConditionDetail condition={selected} onClose={() => setOpenId(null)} />
    </>
  );
}

function HomeVisitConditionDetail({
  condition: selected,
  onClose,
}: {
  condition: PublicHomeVisitCondition | null;
  onClose: () => void;
}) {
  // Held through the close animation so the panel does not empty out mid-fade.
  const condition = useLastNonNull(selected);
  const option = condition ? homeVisitConditionOption(condition) : null;

  return (
    <Modal
      open={selected !== null}
      onClose={onClose}
      labelledBy="home-visit-condition-modal-title"
      closeLabel="Close visit details"
      closeTone="dark"
    >
      {condition && option && (
        <>
          <CatalogDialogHeader
            titleId="home-visit-condition-modal-title"
            title={option.title}
            eyebrow={option.eyebrow}
            subtitle={option.summary}
            imageUrl={option.imageUrl}
            focalX={option.focalX}
            focalY={option.focalY}
            icon={option.icon}
          />

          <div className="px-6 py-6 sm:px-8">
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-3xl font-extrabold text-slate-900">
                  {rupees(option.pricePaise)}
                </span>
                <span className="text-sm text-slate-500">{option.priceUnit}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {condition.travel_fee_included
                  ? "Travel to your address is included in this price."
                  : "A travel fee for your area is added at checkout."}
              </p>
            </div>

            <div className="mt-6">
              <StatTiles items={option.stats} />
            </div>

            <ProseSection title="About this condition" body={option.about} />
            <CheckList items={option.points} title="What we work on" />

            <p className="mt-6 flex items-start gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm leading-relaxed text-teal-900">
              <i aria-hidden="true" className="fa-solid fa-location-dot mt-0.5 text-teal-700" />
              We confirm your pincode is serviceable before anything is charged.
            </p>

            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {"One visit. If you need more, your therapist will recommend them."}
              </p>
              <Link
                href={homeVisitBookHref(condition.id)}
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                <i aria-hidden="true" className="fa-solid fa-calendar-check" />
                Book a home visit
              </Link>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
