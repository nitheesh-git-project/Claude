import { Stagger, StaggerItem, AnimatedCard } from "@/components/motion/primitives";
import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";

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
};

// The home-visit sibling of home/SessionPackages.tsx. Like that one, this is
// a pure display component -- the caller filters on visibility before
// anything reaches here, so there is no visibility logic in this file.
export default function HomeVisitPackages({
  packages,
}: {
  packages: PublicHomeVisitPackage[];
}) {
  if (packages.length === 0) return null;

  return (
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
            <AnimatedCard
              href={`/book-home-visit?package=${pkg.id}`}
              className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 ${
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
              {pkg.image_url ? (
                // Admin-supplied cover image URL, not a static local asset --
                // same reasoning as SessionPackages: next/image would need a
                // remote pattern configured per host the admin might use.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pkg.image_url} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-teal-50 text-teal-300">
                  <i className="fa-solid fa-house-medical text-4xl" />
                </div>
              )}

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

                <div className="mt-auto border-t border-slate-100 pt-5 mt-5">
                  <p className="text-xs text-slate-500">
                    {isSingle ? "Single visit" : `${pkg.visit_count} visits`} ·{" "}
                    {pkg.visit_duration_minutes} min each
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-2xl font-bold text-slate-900">
                      ₹{(pkg.price_paise / 100).toLocaleString("en-IN")}
                    </span>
                    {savings.compareAtPaise !== null && (
                      <span className="text-sm text-slate-400 line-through">
                        ₹{(savings.compareAtPaise / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  {/* Per-visit price is noise on a single visit -- it is the
                      same number as the total, printed twice. */}
                  {!isSingle && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      ₹{(savings.perVisitPaise / 100).toLocaleString("en-IN")} / visit
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
                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 group-hover:gap-2.5 transition-all">
                    Book this <i className="fa-solid fa-arrow-right text-[10px]" />
                  </span>
                </div>
              </div>
            </AnimatedCard>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
