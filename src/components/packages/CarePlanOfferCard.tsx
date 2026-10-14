"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { formatClinicDate } from "@/lib/formatDateTime";
import { useRouter } from "@/lib/useRouter";
import PackageBulkScheduler from "@/components/packages/PackageBulkScheduler";
import ProgrammeCover from "@/components/packages/ProgrammeCover";
import {
  carePlanState,
  parseOfferSnapshot,
  CARE_PLAN_STATE_LABELS,
  type CarePlanStatus,
} from "@/lib/carePlans";
import { formatRupees } from "@/lib/formatMoney";
import { usePricing } from "@/components/pricing/PricingProvider";

function formatInr(paise: number) {
  return `₹${formatRupees(paise)}`;
}

/** Where "Accept & pay" goes: the programme's own review-and-pay page. */
export function programmeCheckoutHref(versionId: string): string {
  return `/patient/dashboard/suggested/checkout?plan=${encodeURIComponent(versionId)}`;
}

export type CarePlanOffer = {
  planId: string;
  planStatus: string;
  versionId: string;
  therapistName: string;
  offerSnapshot: unknown;
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  clinicalRationale: string | null;
  instructions: string | null;
  expiresAt: string | null;
  isHomeVisit: boolean;
  /** The condition's photograph as it is now (with its focal point), read
   *  live so an admin's re-crop reaches an open recommendation. Falls back
   *  to the snapshot's frozen URL when absent. */
  cover?: { src: string | null; focalX: number | null; focalY: number | null } | null;
};

/** A home-visit address the patient already has on file. */
export type SavedAddress = {
  id: string;
  label: string | null;
  line1: string;
  city: string | null;
  pincode: string;
};

/**
 * What the therapist recommended, and the way to buy it.
 *
 * Everything on this card was decided by a clinician who has seen this
 * patient: the programme, how many sessions, how often, whether it needs
 * hands-on work. The patient's decision is yes or no -- there is nothing to
 * configure, which is why there is no picker, no quantity and no add-ons.
 *
 * "Accept & pay" no longer opens Razorpay from here. It used to, which left
 * nowhere to type a promo code and nowhere to read the total before the
 * sheet appeared. It now leads to the programme's review-and-pay page
 * (/patient/dashboard/suggested/checkout), which carries the address for a
 * home visit, the code and a server-quoted breakdown, the way step 3 of the
 * booking wizard does for a single session.
 *
 * Decline guards with a synchronous ref rather than a `disabled` attribute,
 * the same rule SuggestSessionControl documents: `disabled` lands a render
 * too late for a fast double-click.
 */
export default function CarePlanOfferCard({
  offer,
  homeVisitEnabled = true,
  nowMs,
}: {
  offer: CarePlanOffer;
  /** The clinic's master switch. A recommendation written while home
   *  visits were on outlives the switch being turned off, and every route
   *  behind the checkout refuses once it is -- so the card has to say so
   *  rather than offer a button that cannot work. */
  homeVisitEnabled?: boolean;
  /** Passed in from the server so the state does not flip at hydration. */
  nowMs: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [decliningOpen, setDecliningOpen] = useState(false);
  const declineReasonId = useId();
  const [declineReason, setDeclineReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const snapshot = parseOfferSnapshot(offer.offerSnapshot);
  // Video sessions follow the visitor's currency (the server charges the
  // rupee equal of the same figure); a home visit is delivered and charged
  // in India, so it stays in rupees.
  const { formatList, formatAmount, homeVisitsOffered } = usePricing();
  const priceText = (paise: number) => (offer.isHomeVisit ? formatInr(paise) : formatList(paise));
  const perSessionText = (paise: number) => (offer.isHomeVisit ? formatInr(paise) : formatAmount(paise));
  const state = carePlanState(
    { status: offer.planStatus as CarePlanStatus },
    { expires_at: offer.expiresAt },
    nowMs
  );

  function handleDecline() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/patient/decline-care-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ carePlanId: offer.planId, reason: declineReason }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Could not send your answer. Please try again.");
          return;
        }
        setDecliningOpen(false);
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  }

  // Home visits switched off after this was recommended: the checkout's
  // quote and order routes both refuse, so the card says so rather than
  // leading to a page whose Pay button could never succeed. Same rule as the
  // Pay Now button a pay-later session stopped offering -- a control the
  // server refuses outright must not render.
  // Paused by the master switch, or not offered where this patient is.
  const homeVisitWithdrawn = offer.isHomeVisit && (!homeVisitEnabled || !homeVisitsOffered);
  const actionable = state === "awaiting_patient" && !homeVisitWithdrawn;

  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
      {/* The condition's own photograph, the same one its card on
          /conditions carries, shown whole so the recommendation reads as
          that treatment at a glance (ProgrammeCover says why not a crop). */}
      <ProgrammeCover
        src={offer.cover?.src ?? snapshot?.imageUrl ?? null}
        focalX={offer.cover?.focalX}
        focalY={offer.cover?.focalY}
        className="h-52 sm:h-72"
        testId="care-plan-image"
      />
      <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
            Recommended by {offer.therapistName}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
            {snapshot?.title ?? "Treatment programme"}
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
          {CARE_PLAN_STATE_LABELS[state]}
        </span>
      </div>

      {snapshot && (
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-slate-500">{offer.isHomeVisit ? "Visits" : "Sessions"}</dt>
            <dd className="text-sm font-bold text-slate-900">{snapshot.sessionCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Price</dt>
            <dd className="text-sm font-bold text-slate-900" data-price="">
              {priceText(snapshot.pricePaise)}
            </dd>
            {snapshot.perSessionPaise ? (
              <dd className="text-[11px] text-slate-500" data-price="">
                {snapshot.sessionCount} × {perSessionText(snapshot.perSessionPaise)}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">How often</dt>
            <dd className="text-sm font-bold text-slate-900">
              {offer.frequencyPerWeek ? `${offer.frequencyPerWeek} a week` : "Flexible"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">{offer.isHomeVisit ? "Each visit" : "Each session"}</dt>
            <dd className="text-sm font-bold text-slate-900">
              {snapshot.sessionDurationMinutes ? `${snapshot.sessionDurationMinutes} min` : "-"}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag>{offer.isHomeVisit ? "At your home" : "Video sessions"}</Tag>
        {offer.handsOnRequired && <Tag>Hands-on treatment</Tag>}
        {/* No "Valid N days" tag: the programme's validity is said only
            near its end, as a date to book by (patientExpiryNotice). */}
      </div>

      {offer.clinicalRationale && (
        <blockquote className="mt-4 border-l-2 border-teal-200 pl-3 text-sm italic text-slate-700">
          {offer.clinicalRationale}
        </blockquote>
      )}
      {offer.instructions && (
        <p className="mt-3 text-xs text-slate-600">{offer.instructions}</p>
      )}

      {offer.expiresAt && actionable && (
        <p className="mt-3 text-[11px] text-slate-500">
          Hold this price until {formatClinicDate(offer.expiresAt)}.
        </p>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {homeVisitWithdrawn && state === "awaiting_patient" && (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
          {homeVisitsOffered
            ? "Visits at home are paused at the moment, so this cannot be booked just now. Your therapist will be in touch about what to do instead."
            : "Home visits are only available in India, so this cannot be booked from where you are. Your therapist can suggest video sessions instead."}
        </p>
      )}

      {actionable ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* A link, not a payment: the review page shows the full
                breakdown and takes a promo code before Razorpay opens. A
                home visit's figure waits for its address there, because
                travel is charged per visit and depends on where. */}
            <Link
              href={programmeCheckoutHref(offer.versionId)}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              {snapshot && !offer.isHomeVisit
                ? `Accept & pay ${priceText(snapshot.pricePaise)}`
                : "Accept & pay"}
            </Link>
            {!decliningOpen && (
              <button
                type="button"
                onClick={() => setDecliningOpen(true)}
                className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
              >
                Not right now
              </button>
            )}
          </div>

          {decliningOpen && (
            <div className="rounded-xl border border-slate-200 p-3">
              <label htmlFor={declineReasonId} className="block text-xs font-semibold text-slate-700">
                Anything you want your therapist to know? Optional.
              </label>
              <textarea
                id={declineReasonId}
                value={declineReason}
                maxLength={500}
                rows={2}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. I'd like to wait until next month."
                className="mt-1.5 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isPending}
                  className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-300 disabled:opacity-60"
                >
                  {isPending ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => setDecliningOpen(false)}
                  className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            {offer.isHomeVisit
              ? "Next you'll choose where we come and see the full total, travel included, before paying. You book each visit yourself afterwards."
              : "Next you'll see the full total and can add a promo code before paying. You book each session yourself afterwards."}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-xs text-slate-500">
          {state === "lapsed"
            ? "This recommendation has expired. Your therapist can send an updated one after your next session."
            : state === "accepted"
              ? "Paid for. Your sessions are ready to book."
              : "No longer open."}
        </p>
      )}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {children}
    </span>
  );
}


/**
 * The moment straight after payment.
 *
 * The problem this exists to fix: paying used to refresh the screen, the
 * offer card disappeared because the plan was now accepted, and the patient
 * was left looking at nothing -- having just paid for a course of
 * treatment, with no confirmation and no route to the one step that turns
 * their balance into actual appointments. A new sidebar entry appeared
 * silently and they were expected to find it.
 *
 * Two rules shape what replaces it:
 *
 * 1. **Confirm first, ask second.** The first thing on the screen says the
 *    money arrived and what they now own. Nothing is asked of them until
 *    that has been said.
 * 2. **One next step, already answered.** Scheduling opens with the dates
 *    already proposed from the clinician's own cadence, so the ask is
 *    "does this look right?" rather than "compose five appointments". And
 *    "later" is a real, unpunished option -- the dashboard keeps asking
 *    until the balance is spent.
 */
export function PaidAndUnscheduled({
  offer,
  purchaseId,
  sessionCount,
  minGapHours,
  maxPerWeek,
  validityDays,
  bulkScheduleMax,
  nowMs,
  doneHref,
}: {
  offer: CarePlanOffer;
  purchaseId: string | null;
  sessionCount: number;
  minGapHours: number | null;
  maxPerWeek: number | null;
  validityDays: number | null;
  bulkScheduleMax: number;
  nowMs: number;
  /** Where "I'll do it later" and closing the scheduler go. Without it the
   *  current page refreshes, which is right where the offer card lived; the
   *  review-and-pay page sends the patient back to Suggested instead, since
   *  refreshing a checkout for a plan that is now paid would only say so. */
  doneHref?: string;
}) {
  const router = useRouter();
  const [scheduling, setScheduling] = useState(false);
  const finish = () => (doneHref ? router.push(doneHref) : router.refresh());
  const noun = offer.isHomeVisit ? "visit" : "session";

  return (
    <div className="rounded-2xl border border-teal-300 bg-teal-50/50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white"
        >
          <i className="fa-solid fa-check" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Payment received - {sessionCount} {noun}
            {sessionCount === 1 ? "" : "s"}{" "}
            {sessionCount === 1 ? "is" : "are"} yours
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {offer.therapistName} will run {sessionCount === 1 ? "it" : "them"}.
          </p>
        </div>
      </div>

      {/* Home visits schedule from their own widget, which collects the
          address per visit -- so this hands them there rather than opening a
          picker that cannot ask the one question a visit needs. */}
      {offer.isHomeVisit || !purchaseId ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-800">Next: pick your times.</p>
          <p className="mt-1 text-xs text-slate-600">
            Nothing is scheduled yet. Your {noun}s are waiting for you under Your
            programmes.
          </p>
          <button
            type="button"
            onClick={() => router.push("/patient/dashboard/packages")}
            className="mt-3 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
          >
            Pick my times
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-800">
            Shall we put them in the diary now?
          </p>
          <p className="mt-1 text-xs text-slate-600">
            We&apos;ll suggest{" "}
            {offer.frequencyPerWeek
              ? `${offer.frequencyPerWeek} a week, the way ${offer.therapistName} recommended`
              : "a weekly rhythm"}
            . You can change any of them.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setScheduling(true)}
              className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
            >
              Choose my times
            </button>
            {/* A real option, not a dark pattern. The dashboard keeps a
                needsYou item until the balance is spent, so leaving now
                costs nothing and is not forgotten. */}
            <button
              type="button"
              onClick={finish}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              I&apos;ll do it later
            </button>
          </div>
        </div>
      )}

      {scheduling && purchaseId && (
        <PackageBulkScheduler
          purchaseId={purchaseId}
          pendingCount={sessionCount}
          bulkScheduleMax={bulkScheduleMax}
          frequencyPerWeek={offer.frequencyPerWeek}
          minGapHours={minGapHours}
          maxPerWeek={maxPerWeek}
          expiresAt={
            validityDays ? new Date(nowMs + validityDays * 86_400_000).toISOString() : null
          }
          onClose={() => {
            setScheduling(false);
            finish();
          }}
        />
      )}
    </div>
  );
}
