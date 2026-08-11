import { Reveal, Stagger, StaggerItem, AnimatedCard } from "@/components/motion/primitives";
import { computePackageSavings } from "@/lib/packageProgress";

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
};

// Rendered on both / (visible_on_home) and /conditions (visible_on_conditions)
// -- both callers filter the rows they pass in before this component ever
// sees them, so this stays a pure display component with no visibility
// logic of its own.
export default function SessionPackages({ packages }: { packages: PublicPackage[] }) {
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
                <AnimatedCard
                  href={`/book?package=${pkg.id}`}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 ${
                    pkg.highlight ? "border-teal-300 ring-2 ring-teal-100" : "border-slate-200 hover:border-teal-300"
                  }`}
                >
                  {pkg.badge_label && (
                    <span className="absolute right-4 top-4 z-10 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                      {pkg.badge_label}
                    </span>
                  )}
                  {pkg.image_url ? (
                    // Admin-supplied cover image URL, not a static local
                    // asset -- next/image would require configuring a
                    // remote pattern per host the admin might use, so a
                    // plain img keeps this admin-controlled without an
                    // allowlist to maintain.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pkg.image_url} alt="" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-teal-50 text-teal-300">
                      <i className="fa-solid fa-layer-group text-4xl" />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-lg font-bold text-slate-900">{pkg.title}</h3>
                    {pkg.subtitle && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">{pkg.subtitle}</p>
                    )}

                    {promises.length > 0 && (
                      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        {promises.slice(0, 4).map((p) => (
                          <li key={p} className="flex items-start gap-2 text-xs leading-snug text-slate-700">
                            <i className="fa-solid fa-circle-check mt-0.5 shrink-0 text-teal-600" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    )}

                    {pkg.therapist_locked && (
                      <p className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-teal-700">
                        <i className="fa-solid fa-user-doctor" /> One therapist for your whole programme
                      </p>
                    )}

                    <div className="mt-auto pt-5 border-t border-slate-100 mt-5">
                      <p className="text-xs text-slate-500">{pkg.session_count} sessions</p>
                      <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                        <span className="font-display text-2xl font-bold text-slate-900">
                          ₹{(pkg.price_paise / 100).toLocaleString("en-IN")}
                        </span>
                        {savings.compareAtPaise !== null && (
                          <span className="text-sm text-slate-400 line-through">
                            ₹{(savings.compareAtPaise / 100).toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        ₹{(savings.perSessionPaise / 100).toLocaleString("en-IN")} / session
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
                      <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                        Get this programme
                        <i className="fa-solid fa-arrow-right text-[10px] transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </div>
                </AnimatedCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </div>
  );
}
