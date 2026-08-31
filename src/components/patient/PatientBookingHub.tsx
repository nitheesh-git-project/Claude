import Link from "next/link";
import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";

export type HubCategory = {
  id: string;
  title: string;
  description: string | null;
  price_paise: number;
  duration_minutes: number;
  cta_label: string | null;
};

export type HubHomeVisitPackage = {
  id: string;
  title: string;
  subtitle: string | null;
  badge_label: string | null;
  visit_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  visit_duration_minutes: number;
  validity_days: number | null;
  travel_fee_included: boolean;
};

function Card({
  href,
  title,
  subtitle,
  badge,
  meta,
  price,
  compareAt,
  footnote,
  savingsPercent,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  meta: string;
  price: number;
  compareAt?: number | null;
  footnote?: string | null;
  savingsPercent?: number | null;
}) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
    >
      {badge && (
        <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          {badge}
        </span>
      )}
      <p className="pr-16 text-sm font-bold text-slate-900">{title}</p>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
      <p className="mt-2 text-[11px] text-slate-400">{meta}</p>
      <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900">
            ₹{(price / 100).toLocaleString("en-IN")}
          </span>
          {compareAt != null && (
            <span className="text-xs text-slate-400 line-through">
              ₹{(compareAt / 100).toLocaleString("en-IN")}
            </span>
          )}
          {savingsPercent != null && (
            <span className="text-[11px] font-semibold text-teal-700">
              Save {savingsPercent}%
            </span>
          )}
        </div>
        {footnote && <p className="mt-0.5 text-[11px] text-slate-400">{footnote}</p>}
        <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 transition-all group-hover:gap-2.5">
          Book <i className="fa-solid fa-arrow-right text-[10px]" />
        </span>
      </div>
    </Link>
  );
}

function Group({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">{blurb}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

/**
 * Everything this patient can book, in one place, always visible.
 *
 * The dashboard's history sections come and go with what the patient
 * actually has -- but booking never does. There is no such thing as an
 * "online patient" or a "home-visit patient": one patient can book either
 * kind any time, and hiding a product because they have not used it yet is
 * how a patient never discovers it.
 *
 * Every card deep-links into the existing wizard for its mode, so nothing
 * about the booking flows is duplicated here. A signed-in patient skips the
 * signup step in either wizard automatically.
 */
export default function PatientBookingHub({
  categories,
  homeVisitPackages,
}: {
  categories: HubCategory[];
  homeVisitPackages: HubHomeVisitPackage[];
}) {
  const hasAnything =
    categories.length > 0 || homeVisitPackages.length > 0;

  if (!hasAnything) {
    return (
      <p className="py-6 text-center text-xs text-slate-500">
        Nothing is available to book right now — please check back shortly.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {categories.length > 0 && (
        <Group
          title="Single online consultation"
          blurb="One video session with a therapist, booked for a specific concern."
        >
          {categories.map((c) => (
            <Card
              key={c.id}
              href={`/book?category=${c.id}`}
              title={c.title}
              subtitle={c.description}
              meta={`${c.duration_minutes} min · online`}
              price={c.price_paise}
            />
          ))}
        </Group>
      )}

      {homeVisitPackages.length > 0 && (
        <Group
          title="Home visits"
          blurb="A therapist comes to you. We'll check your pincode before anything is charged."
        >
          {homeVisitPackages.map((p) => {
            const savings = computeHomeVisitSavings({
              visitCount: p.visit_count,
              pricePaise: p.price_paise,
              compareAtPaise: p.compare_at_paise,
            });
            const isSingle = p.visit_count === 1;
            return (
              <Card
                key={p.id}
                href={`/book-home-visit?package=${p.id}`}
                title={p.title}
                subtitle={p.subtitle}
                badge={p.badge_label}
                meta={`${isSingle ? "Single visit" : `${p.visit_count} visits`} · ${
                  p.visit_duration_minutes
                } min at home`}
                price={p.price_paise}
                compareAt={savings.compareAtPaise}
                savingsPercent={isSingle ? null : savings.savingsPercent}
                footnote={
                  p.travel_fee_included
                    ? "Travel included"
                    : "Travel charged separately, by area"
                }
              />
            );
          })}
        </Group>
      )}
    </div>
  );
}
