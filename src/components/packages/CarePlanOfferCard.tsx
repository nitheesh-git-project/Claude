"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { payForCarePlan } from "@/lib/carePlanPayment";
import AddressForm from "@/components/booking/AddressForm";
import PackageBulkScheduler from "@/components/packages/PackageBulkScheduler";
import type { HomeVisitAddressForm } from "@/lib/homeVisitPayment";
import {
  carePlanState,
  parseOfferSnapshot,
  CARE_PLAN_STATE_LABELS,
  type CarePlanStatus,
} from "@/lib/carePlans";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
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
};

/**
 * What the therapist recommended, and the one button that buys it.
 *
 * Everything on this card was decided by a clinician who has seen this
 * patient: the programme, how many sessions, how often, whether it needs
 * hands-on work. The patient's decision is yes or no -- there is nothing to
 * configure, which is why there is no picker, no quantity and no add-ons.
 *
 * Both controls guard with a synchronous ref rather than a `disabled`
 * attribute, the same rule SuggestSessionControl documents: `disabled`
 * lands a render too late for a fast double-click, and this one opens a
 * payment window.
 */
export type SavedAddress = {
  id: string;
  label: string | null;
  line1: string;
  city: string | null;
  pincode: string;
};

export default function CarePlanOfferCard({
  offer,
  patientName,
  patientEmail,
  savedAddresses,
  nowMs,
  bulkScheduleMax,
}: {
  offer: CarePlanOffer;
  patientName: string;
  patientEmail: string;
  /** Home-visit recommendations only: what the patient already has on file. */
  savedAddresses: SavedAddress[];
  /** Passed in from the server so the state does not flip at hydration. */
  nowMs: number;
  /** The admin's cap on how many sessions may be scheduled in one go. */
  bulkScheduleMax: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ purchaseId: string | null } | null>(null);
  const [decliningOpen, setDecliningOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [paying, setPaying] = useState(false);
  const inFlight = useRef(false);

  // Where a recommended course of home visits is delivered.
  //
  // Asked here rather than after payment because the purchase itself is
  // booked against a saved address -- a home-visit purchase with none is
  // one the patient cannot use, which is exactly the state this card used
  // to create. Defaults to the first address on file, since a patient being
  // recommended home visits has usually had one already.
  const [addressId, setAddressId] = useState<string | null>(
    savedAddresses[0]?.id ?? null
  );
  const [newAddress, setNewAddress] = useState<HomeVisitAddressForm>({
    line1: "",
    pincode: "",
  });
  const usingNewAddress = addressId === null;

  // What the visits will actually cost, travel included.
  //
  // This card used to print the programme price on the button while
  // /api/care-plan/create-order charged the programme price PLUS travel for
  // every visit in it -- a four-visit programme in a ₹150 area was ₹600
  // more than the button said. Quoting a different number than you charge
  // is the one thing a payment screen must never do, so the fee is fetched
  // for the address in front of the patient and shown as its own line.
  //
  // check-area is the same endpoint the home-visit wizard uses, so the
  // serviceability answer here and at checkout come from one place.
  const pincode = usingNewAddress
    ? newAddress.pincode?.trim() ?? ""
    : savedAddresses.find((a) => a.id === addressId)?.pincode ?? "";
  // Keyed by the pincode it was fetched for, so a changed address derives
  // "no quote yet" instead of an effect writing state synchronously to
  // clear it -- which is a cascading render, and would also blink the total
  // away for a frame while the same answer was refetched.
  type QuoteResult = { travelFeePaise: number } | "unserviceable";
  const [quoted, setQuoted] = useState<{ pincode: string; result: QuoteResult } | null>(null);
  const pincodeReady = /^\d{6}$/.test(pincode);
  const quote: { state: "idle" | "loading" } | { state: "unserviceable" } | { state: "ready"; travelFeePaise: number } =
    !offer.isHomeVisit || !pincodeReady
      ? { state: "idle" }
      : quoted?.pincode !== pincode
        ? { state: "loading" }
        : quoted.result === "unserviceable"
          ? { state: "unserviceable" }
          : { state: "ready", travelFeePaise: quoted.result.travelFeePaise };

  useEffect(() => {
    if (!offer.isHomeVisit || !pincodeReady) return;
    let cancelled = false;
    fetch(`/api/home-visit/check-area?pincode=${pincode}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setQuoted({
          pincode,
          result:
            data?.serviceable && typeof data.travelFeePaise === "number"
              ? { travelFeePaise: data.travelFeePaise }
              : "unserviceable",
        });
      })
      .catch(() => {
        // A failed quote must not block the purchase: the server resolves
        // the real figure at checkout regardless. The button falls back to
        // saying "Accept & pay" with no number rather than the wrong one.
      });
    return () => {
      cancelled = true;
    };
  }, [offer.isHomeVisit, pincode, pincodeReady]);



  const snapshot = parseOfferSnapshot(offer.offerSnapshot);
  const travelPaise =
    offer.isHomeVisit && quote.state === "ready" && snapshot
      ? quote.travelFeePaise * Math.max(1, snapshot.sessionCount)
      : 0;
  // A package with travel already in its price adds nothing on top.
  const chargeablePaise = snapshot
    ? snapshot.pricePaise + (snapshot.travelFeeIncluded ? 0 : travelPaise)
    : null;
  const totalKnown = !offer.isHomeVisit || quote.state === "ready";
  const state = carePlanState(
    { status: offer.planStatus as CarePlanStatus },
    { expires_at: offer.expiresAt },
    nowMs
  );

  function handlePay() {
    if (inFlight.current) return;
    if (offer.isHomeVisit) {
      if (usingNewAddress && (!newAddress.line1.trim() || !newAddress.pincode.trim())) {
        setError("Add the address these visits should come to.");
        return;
      }
      if (quote.state === "unserviceable") {
        setError("We don't visit that pincode yet. Try another address, or ask us about it.");
        return;
      }
    }
    inFlight.current = true;
    setPaying(true);
    setError(null);
    void payForCarePlan({
      carePlanVersionId: offer.versionId,
      addressId: offer.isHomeVisit ? addressId : null,
      address: offer.isHomeVisit && usingNewAddress ? newAddress : null,
      name: patientName,
      email: patientEmail,
      description: snapshot?.title ?? "Treatment programme",
      onSuccess: ({ purchaseId }) => {
        inFlight.current = false;
        setPaying(false);
        // Deliberately NOT a plain refresh.
        //
        // A refresh here removed the card and put nothing in its place: the
        // patient had just spent several thousand rupees, and the screen
        // went blank at the highest-intent moment in the whole product.
        // What they actually bought is appointments, not a credit balance,
        // so the payment now lands on the step that turns one into the
        // other.
        setPaid({ purchaseId });
      },
      onError: (message) => {
        inFlight.current = false;
        setPaying(false);
        setError(message);
      },
      onDismiss: () => {
        inFlight.current = false;
        setPaying(false);
      },
    });
  }

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

  const actionable = state === "awaiting_patient";

  // What the patient sees the instant the payment clears, in place of the
  // card they were reading. It stays until they schedule or dismiss it --
  // a refresh would drop them back to a screen with nothing on it.
  if (paid) {
    return (
      <PaidAndUnscheduled
        offer={offer}
        purchaseId={paid.purchaseId}
        sessionCount={snapshot?.sessionCount ?? 0}
        minGapHours={snapshot?.minGapHours ?? null}
        maxPerWeek={snapshot?.maxPerWeek ?? null}
        validityDays={snapshot?.validityDays ?? null}
        bulkScheduleMax={bulkScheduleMax}
        nowMs={nowMs}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-teal-200 bg-white p-6 shadow-sm">
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
            <dt className="text-[11px] text-slate-400">Sessions</dt>
            <dd className="text-sm font-bold text-slate-900">{snapshot.sessionCount}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">Price</dt>
            <dd className="text-sm font-bold text-slate-900">
              {formatInr(snapshot.pricePaise)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">How often</dt>
            <dd className="text-sm font-bold text-slate-900">
              {offer.frequencyPerWeek ? `${offer.frequencyPerWeek} a week` : "Flexible"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">Each session</dt>
            <dd className="text-sm font-bold text-slate-900">
              {snapshot.sessionDurationMinutes ? `${snapshot.sessionDurationMinutes} min` : "—"}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag>{offer.isHomeVisit ? "At your home" : "Video sessions"}</Tag>
        {offer.handsOnRequired && <Tag>Hands-on treatment</Tag>}
        {snapshot?.validityDays && <Tag>Valid {snapshot.validityDays} days</Tag>}
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
          Hold this price until {new Date(offer.expiresAt).toLocaleDateString()}.
        </p>
      )}

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {actionable && offer.isHomeVisit && (
        <div className="mt-5 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-800">Where should we come?</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Travel to your area is added at checkout and shown before you pay.
          </p>
          {savedAddresses.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {savedAddresses.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="radio"
                    name={`address-${offer.versionId}`}
                    className="mt-0.5"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                  />
                  <span className="text-slate-700">
                    {a.label ? <span className="font-semibold">{a.label} · </span> : null}
                    {a.line1}
                    {a.city ? `, ${a.city}` : ""} — {a.pincode}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name={`address-${offer.versionId}`}
                  className="mt-0.5"
                  checked={usingNewAddress}
                  onChange={() => setAddressId(null)}
                />
                <span className="text-slate-700">Somewhere else</span>
              </label>
            </div>
          )}
          {usingNewAddress && (
            <div className="mt-3">
              <AddressForm value={newAddress} onChange={setNewAddress} disabled={paying} />
            </div>
          )}

          {quote.state === "unserviceable" && (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              We don&apos;t visit that pincode yet. Try another address, or get in touch and
              we&apos;ll tell you when we do.
            </p>
          )}

          {snapshot && quote.state === "ready" && (
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Programme</dt>
                <dd className="font-semibold text-slate-800">
                  {formatInr(snapshot.pricePaise)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">
                  Travel
                  {!snapshot.travelFeeIncluded && (
                    <> · {formatInr(quote.travelFeePaise)} × {snapshot.sessionCount} visits</>
                  )}
                </dt>
                <dd className="font-semibold text-slate-800">
                  {snapshot.travelFeeIncluded ? "Included" : formatInr(travelPaise)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1">
                <dt className="font-semibold text-slate-700">Total</dt>
                <dd className="font-bold text-slate-900">
                  {chargeablePaise !== null ? formatInr(chargeablePaise) : "—"}
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {actionable ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePay}
              disabled={paying || quote.state === "unserviceable"}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {paying
                ? "Opening payment…"
                : chargeablePaise !== null && totalKnown
                  ? `Accept & pay ${formatInr(chargeablePaise)}`
                  : "Accept & pay"}
            </button>
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
              <label className="block text-xs font-semibold text-slate-700">
                Anything you want your therapist to know? Optional.
              </label>
              <textarea
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
            You book each session yourself afterwards, at times that suit you.
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
function PaidAndUnscheduled({
  offer,
  purchaseId,
  sessionCount,
  minGapHours,
  maxPerWeek,
  validityDays,
  bulkScheduleMax,
  nowMs,
}: {
  offer: CarePlanOffer;
  purchaseId: string | null;
  sessionCount: number;
  minGapHours: number | null;
  maxPerWeek: number | null;
  validityDays: number | null;
  bulkScheduleMax: number;
  nowMs: number;
}) {
  const router = useRouter();
  const [scheduling, setScheduling] = useState(false);
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
            Payment received — {sessionCount} {noun}
            {sessionCount === 1 ? "" : "s"}{" "}
            {sessionCount === 1 ? "is" : "are"} yours
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {offer.therapistName} will run {sessionCount === 1 ? "it" : "them"}.
            {validityDays ? ` Use them within ${validityDays} days.` : ""}
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
              onClick={() => router.refresh()}
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
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
