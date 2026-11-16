import HomeVisitOnly from "@/components/pricing/HomeVisitOnly";
import ProgramCards from "@/components/catalog/ProgramCards";
import HomeVisitConditions from "@/components/home/HomeVisitConditions";
import { type HomeVisitConditionRow } from "@/lib/serviceOptions";

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

/** A condition offered as one home visit, at its home-visit price. */
export type HubHomeVisitCondition = HomeVisitConditionRow;

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
              className={`rounded-full px-2 py-0.5 text-[13px] font-bold uppercase tracking-wide ${
                online ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {count} {count === 1 ? "option" : "options"}
            </span>
          </div>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-slate-500">{blurb}</p>
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
      {children}
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
 * The cards are the public ones (ProgramCards, HomeVisitConditions): a tap
 * opens the same detail pop-up as on /conditions and /home-visit, and Book
 * deep-links into the existing wizard for its mode, so nothing about the
 * booking flows is duplicated here. A signed-in patient skips the
 * signup step in either wizard automatically.
 */
export default function PatientBookingHub({
  categories,
  homeVisitConditions,
}: {
  categories: HubCategory[];
  homeVisitConditions: HubHomeVisitCondition[];
}) {
  const hasAnything =
    categories.length > 0 || homeVisitConditions.length > 0;

  if (!hasAnything) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Nothing is available to book right now - please check back shortly.
      </p>
    );
  }

  return (
    <div className="space-y-9">
      {categories.length > 0 && (
        <Group
          title="Single online consultation"
          blurb="One video session with a physiotherapist, booked for a specific concern."
          tone="online"
          icon="fa-video"
          count={categories.length}
        >
          {/* The public cards themselves (/conditions), so a tap on one opens
              the same detail pop-up a visitor gets, with booking one button
              away; the patient's dashboard had the cards without it. */}
          <ProgramCards programs={categories} columns="three" />
        </Group>
      )}

      {homeVisitConditions.length > 0 && (
        <HomeVisitOnly>
        <Group
          title="Home visits"
          blurb="One visit from a physiotherapist at your address. We'll check your pincode before anything is charged."
          tone="home"
          icon="fa-house-medical"
          count={homeVisitConditions.length}
        >
          <HomeVisitConditions conditions={homeVisitConditions} />
        </Group>
        </HomeVisitOnly>
      )}
    </div>
  );
}
