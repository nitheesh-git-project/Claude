"use client";

import type { ReactNode } from "react";
import Link from "@/components/system/ProgressLink";
import { usePricing } from "@/components/pricing/PricingProvider";

/**
 * Renders its children only where home visits are offered: always in India,
 * and elsewhere only when an admin has allowed it (Catalog -> Countries &
 * currency). Anywhere else it renders `fallback`, which defaults to nothing.
 *
 * Display only. The routes that sell a visit refuse a visitor outside India
 * by themselves (countryPricingServer.pricingForRequest), so this is about
 * not offering what would then be refused.
 */
export default function HomeVisitOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { homeVisitsOffered } = usePricing();
  return <>{homeVisitsOffered ? children : fallback}</>;
}

/** What a home-visit page says to a visitor it is not offered to. */
export function HomeVisitUnavailable() {
  return (
    <section
      data-testid="home-visit-unavailable"
      className="mx-auto my-16 max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
        <i className="fa-solid fa-house-medical" aria-hidden="true" />
      </span>
      <h1 className="font-display mt-4 text-xl font-bold text-slate-900">
        Home visits are only available in India
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Our therapists visit patients at home across our Indian service areas. Wherever you are,
        you can see the same licensed physiotherapists over a one-to-one video session.
      </p>
      <Link
        href="/book"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-bold text-white transition hover:bg-teal-800"
      >
        Book a video session
      </Link>
    </section>
  );
}
