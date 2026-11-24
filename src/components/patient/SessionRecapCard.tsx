import Link from "next/link";
import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";
import type { Recap } from "@/lib/sessionRecap";
import { BOOKING_FROM_DASHBOARD } from "@/components/BookingBackToSessions";

/**
 * The recap after a session (guided check, phase 2, P6): for a week after
 * the physiotherapist shares a summary, one card with what was done, what to
 * do before next time, the home exercises and the next session. Read only;
 * the words are the physiotherapist's own summary, never the session note.
 */
export default function SessionRecapCard({ recap }: { recap: Recap }) {
  return (
    <section aria-labelledby="recap-heading" data-testid="session-recap" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-800">
        Your last session · from {recap.writtenBy} · {formatClinicDate(recap.writtenAt)}
      </p>
      <h2 id="recap-heading" className="mt-1 font-display text-lg font-bold text-slate-900">
        Your session recap
      </h2>
      <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {recap.whatWeDid && (
          <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5">
            <dt className="text-[13px] font-bold text-emerald-900">What we did</dt>
            <dd className="mt-0.5 text-[15px] leading-relaxed text-slate-900 [overflow-wrap:anywhere]">{recap.whatWeDid}</dd>
          </div>
        )}
        {recap.beforeNextTime && (
          <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
            <dt className="text-[13px] font-bold text-slate-800">Before your next session</dt>
            <dd className="mt-0.5 text-[15px] leading-relaxed text-slate-900 [overflow-wrap:anywhere]">{recap.beforeNextTime}</dd>
          </div>
        )}
        {recap.exercisesLine && (
          <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
            <dt className="text-[13px] font-bold text-slate-800">Your home exercises</dt>
            <dd className="mt-0.5 text-[15px] text-slate-900">
              {recap.exercisesLine} ·{" "}
              <Link href="/patient/dashboard/health-profile#home-exercises" className="font-semibold text-teal-800 underline">
                See how
              </Link>
            </dd>
          </div>
        )}
        <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
          <dt className="text-[13px] font-bold text-slate-800">Next session</dt>
          <dd className="mt-0.5 text-[15px] text-slate-900">
            {recap.nextSlotTime ? (
              formatClinicDateTime(recap.nextSlotTime)
            ) : (
              <Link href={BOOKING_FROM_DASHBOARD} className="font-semibold text-teal-800 underline">
                Book your next session
              </Link>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
