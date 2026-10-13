import SurfaceCard from "@/components/dashboard/SurfaceCard";
import ProgressLink from "@/components/system/ProgressLink";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { formatRupees } from "@/lib/formatMoney";
import type { FeedItem } from "@/lib/dashboardFeed";
import { PULSE_WINDOW_MS, type RecommendationPulseCounts } from "@/lib/recommendationPulse";

const TONE: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-blue-50 text-blue-600",
  good: "bg-emerald-50 text-emerald-600",
  warn: "bg-amber-50 text-amber-600",
  bad: "bg-red-50 text-red-600",
};

/** How many events the card lists; the Activity feed and the screen have the rest. */
const SHOWN = 6;
const WINDOW_DAYS = Math.round(PULSE_WINDOW_MS / 86_400_000);

/**
 * Today's Recommendations card: where the clinic's programmes start, as it
 * happens.
 *
 * Today used to carry one line - "N recommendations waiting for approval" -
 * so a patient paying for six sessions, turning one down, or letting one
 * lapse was news nobody was told. Four figures answer "how is this going",
 * and the list below says what just happened, the two urgent kinds first
 * (see src/lib/recommendationPulse.ts). It sits above the Activity feed
 * because it is the part of Today that is the business.
 *
 * Dates are formatted in the clinic's zone, never relative: this is a server
 * component and a relative time would disagree with the browser at
 * hydration (ActivityFeed explains).
 */
export default function AdminRecommendationPulse({
  counts,
  events,
  href,
  showMoney,
}: {
  counts: RecommendationPulseCounts;
  events: FeedItem[];
  /** The Recommendations screen, when this admin may open it. */
  href?: string;
  showMoney: boolean;
}) {
  const tiles: { label: string; value: string; hint?: string; urgent?: boolean; good?: boolean }[] = [
    {
      label: "Waiting for approval",
      value: String(counts.waitingApproval),
      hint: counts.waitingApproval > 0 ? "Patient can't see it yet" : "Nothing queued",
      urgent: counts.waitingApproval > 0,
    },
    {
      label: "With patients",
      value: String(counts.withPatients),
      hint: counts.lapsingSoon > 0 ? `${counts.lapsingSoon} lapsing soon` : "Waiting on their answer",
    },
    {
      label: `Paid · last ${WINDOW_DAYS} days`,
      value: String(counts.paidInWindow),
      hint: showMoney
        ? `₹${formatRupees(counts.paidInWindowPaise)}`
        : counts.declinedInWindow > 0
          ? `${counts.declinedInWindow} declined`
          : undefined,
      good: counts.paidInWindow > 0,
    },
    {
      label: "Paid, nothing booked",
      value: String(counts.paidUnbooked),
      hint: counts.paidUnbooked > 0 ? "Ring to schedule" : "All scheduling",
      urgent: counts.paidUnbooked > 0,
    },
  ];

  return (
    <SurfaceCard
      id="today-recommendations"
      title="Recommendations"
      icon="fa-lightbulb"
      subtitle={`Every programme starts here. Approvals, payments, declines and lapses from the last ${WINDOW_DAYS} days.`}
      actions={
        href ? (
          <ProgressLink
            href={href}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50"
          >
            Open recommendations
          </ProgressLink>
        ) : null
      }
    >
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="recommendation-pulse-counts">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`rounded-xl border p-3 ${
              t.urgent
                ? "border-amber-200 bg-amber-50/70"
                : t.good
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-slate-200 bg-slate-50/60"
            }`}
          >
            <dt className="text-[11px] font-semibold text-slate-600">{t.label}</dt>
            <dd className="mt-1 font-display text-2xl font-bold text-slate-900">{t.value}</dd>
            {t.hint && (
              <dd className={`text-[11px] ${t.urgent ? "font-semibold text-amber-800" : "text-slate-500"}`}>
                {t.hint}
              </dd>
            )}
          </div>
        ))}
      </dl>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No recommendations in the last {WINDOW_DAYS} days. When a therapist recommends a programme,
          it shows here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100" data-testid="recommendation-pulse-events">
          {events.slice(0, SHOWN).map((e) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE[e.tone] ?? TONE.neutral}`}
                >
                  <i className={`fa-solid ${e.icon} text-xs`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{e.title}</span>
                    {e.needsYou && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        Needs you
                      </span>
                    )}
                  </span>
                  {e.detail && <span className="block text-xs text-slate-500">{e.detail}</span>}
                  <span className="block text-[11px] text-slate-400">{formatClinicDateTime(e.at)}</span>
                </span>
              </>
            );
            return (
              <li key={e.id} data-event={e.id}>
                {e.href ? (
                  <ProgressLink href={e.href} className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-slate-50">
                    {body}
                  </ProgressLink>
                ) : (
                  <div className="flex items-start gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {events.length > SHOWN && (
        <p className="mt-2 text-[11px] text-slate-500">
          {events.length - SHOWN} more in Activity{href ? " and on the Recommendations screen" : ""}.
        </p>
      )}
    </SurfaceCard>
  );
}
