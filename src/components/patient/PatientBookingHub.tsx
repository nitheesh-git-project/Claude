import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";
import CatalogCard from "@/components/catalog/CatalogCard";

export type HubCategory = {
  id: string;
  title: string;
  description: string | null;
  points?: string[];
  image_url?: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
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
  therapist_locked?: boolean;
  benefits?: unknown;
  highlight?: boolean;
  image_url?: string | null;
  image_focal_x?: number | null;
  image_focal_y?: number | null;
};

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
        Nothing is available to book right now - please check back shortly.
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
            <CatalogCard
              key={c.id}
              data={{
                id: c.id,
                title: c.title,
                summary: c.description,
                imageUrl: c.image_url ?? null,
                focalX: c.image_focal_x,
                focalY: c.image_focal_y,
                meta: [`${c.duration_minutes} min`, "Video session", "1-on-1"],
                points: c.points ?? [],
                pricePaise: c.price_paise,
                priceUnit: `/ ${c.duration_minutes} min session`,
                bookHref: `/book?category=${c.id}`,
                bookLabel: c.cta_label?.trim() || "Book this session",
              }}
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
            const benefits = Array.isArray(p.benefits) ? (p.benefits as string[]) : [];
            return (
              <CatalogCard
                key={p.id}
                data={{
                  id: p.id,
                  title: p.title,
                  summary: p.subtitle,
                  imageUrl: p.image_url ?? null,
                  focalX: p.image_focal_x,
                  focalY: p.image_focal_y,
                  badge: p.badge_label,
                  highlight: p.highlight,
                  meta: [
                    isSingle ? "Single visit" : `${p.visit_count} visits`,
                    `${p.visit_duration_minutes} min${isSingle ? "" : " each"}`,
                    p.travel_fee_included ? "Travel included" : "Travel by area",
                    !isSingle && p.therapist_locked ? "Same therapist" : "",
                    p.validity_days ? `Valid ${p.validity_days} days` : "",
                  ].filter(Boolean),
                  points: benefits,
                  pricePaise: p.price_paise,
                  compareAtPaise: savings.compareAtPaise,
                  savingsPaise:
                    savings.compareAtPaise === null
                      ? null
                      : savings.compareAtPaise - p.price_paise,
                  priceUnit: isSingle ? "/ visit" : `/ ${p.visit_count} visits`,
                  bookHref: `/book-home-visit?package=${p.id}`,
                  bookLabel: isSingle ? "Book this visit" : "Book a first visit",
                  icon: "fa-house-medical",
                }}
              />
            );
          })}
        </Group>
      )}
    </div>
  );
}
