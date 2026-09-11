import Link from "@/components/system/ProgressLink";
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

/**
 * The header over one way of being seen.
 *
 * It was a `text-sm font-bold` line over a `text-xs` one -- the exact weight
 * the cards underneath use for their own titles, in the same ink, on the
 * same white. So the two delivery modes did not read as two sections at all;
 * they read as more cards, and the heading that was supposed to tell a
 * patient "this one is a video call and this one comes to your house"
 * disappeared into the list it was introducing.
 *
 * Three things give it a level of its own, and each carries information
 * rather than decoration:
 *
 * - **A filled tile in the mode's own colour.** Teal for video, amber for a
 *   home visit -- the same pairing the rest of the patient's dashboard
 *   already uses (`fa-house-medical` on the home-visit widget and session
 *   card, the amber badge on the cards below). A solid tile against white is
 *   what makes it survive at a glance; an outline would have blended for the
 *   same reason the text did.
 * - **The display face, a step up in size.** The cards keep `font-bold` at
 *   `text-sm`, so the heading has to move in weight *and* scale to sit above
 *   them rather than beside them.
 * - **A count.** How many ways there are to book this mode is a real fact a
 *   patient uses -- and it is what makes the rule underneath a divider
 *   between two sets rather than a line drawn for effect.
 */
function Group({
  title,
  blurb,
  tone,
  icon,
  count,
  children,
}: {
  title: string;
  blurb: string;
  tone: "online" | "home";
  icon: string;
  count: number;
  children: React.ReactNode;
}) {
  const online = tone === "online";
  return (
    <div>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base text-white shadow-sm ${
            online ? "bg-teal-600" : "bg-amber-500"
          }`}
        >
          <i className={`fa-solid ${icon}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="font-display text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
              {title}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                online ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {count} {count === 1 ? "option" : "options"}
            </span>
          </div>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-slate-500">{blurb}</p>
        </div>
      </div>
      {/* Starts in the mode's colour and fades out, so it reads as belonging
          to the heading above it rather than as a border around the grid. */}
      <div
        aria-hidden
        className={`mt-3 mb-4 h-px bg-gradient-to-r to-transparent ${
          online ? "from-teal-300 via-teal-100" : "from-amber-300 via-amber-100"
        }`}
      />
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
    <div className="space-y-9">
      {categories.length > 0 && (
        <Group
          title="Single online consultation"
          blurb="One video session with a therapist, booked for a specific concern."
          tone="online"
          icon="fa-video"
          count={categories.length}
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
          tone="home"
          icon="fa-house-medical"
          count={homeVisitPackages.length}
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
