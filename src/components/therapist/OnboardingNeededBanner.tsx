import Link from "next/link";
import OnboardingGuideButton from "@/components/therapist/OnboardingGuideButton";
import { formatClinicDateTime } from "@/lib/formatDateTime";

export type OnboardingNeededPatient = {
  id: string;
  name: string;
  /** Their next session with this therapist, when one is booked. */
  nextSlot: string | null;
};

/** Patients shown by name before the rest are counted. */
const SHOWN = 3;

/**
 * The top of the therapist's Home while a patient is waiting to be
 * onboarded. The feed row says it too, but among assignments and payouts
 * it scrolls away -- and until it is done the patient's own Health Profile
 * is locked, so it earns the one place above the greeting (the slot the
 * admin's System Health line uses). Each row goes straight into the
 * triage; the guide explains the whole thing for anyone doing it the
 * first time.
 */
export default function OnboardingNeededBanner({ patients }: { patients: OnboardingNeededPatient[] }) {
  if (patients.length === 0) return null;
  const shown = patients.slice(0, SHOWN);
  const more = patients.length - shown.length;
  return (
    <section
      aria-label="Patients who need onboarding"
      className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <i className="fa-solid fa-clipboard-question" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold text-slate-900">
              {patients.length === 1
                ? `${patients[0].name} needs onboarding`
                : `${patients.length} patients need onboarding`}
            </h2>
            <p className="mt-0.5 max-w-xl text-xs text-slate-600">
              Their Health Profile stays locked to them until you fill it. Do it with them in the
              first session - four questions, then their condition type&apos;s own set.
            </p>
          </div>
        </div>
        <OnboardingGuideButton variant="button" />
      </div>
      <ul className="mt-3 space-y-2">
        {shown.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-white px-3 py-2"
          >
            <span className="min-w-0 text-xs">
              <span className="font-semibold text-slate-900">{p.name}</span>
              <span className="text-slate-500">
                {p.nextSlot ? ` · next session ${formatClinicDateTime(p.nextSlot)}` : " · no session booked yet"}
              </span>
            </span>
            <Link
              href={`/therapist/dashboard/health-profile/${p.id}?start=onboarding`}
              className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-800"
            >
              Start onboarding
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="mt-2 text-[11px] text-slate-600">
          And {more} more -{" "}
          <Link href="/therapist/dashboard/health-profile" className="font-semibold text-teal-700 hover:underline">
            see them on Health Profiles
          </Link>
          .
        </p>
      )}
    </section>
  );
}
