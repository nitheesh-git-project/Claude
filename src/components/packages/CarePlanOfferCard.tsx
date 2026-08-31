"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { payForCarePlan } from "@/lib/carePlanPayment";
import AddressForm from "@/components/booking/AddressForm";
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
}: {
  offer: CarePlanOffer;
  patientName: string;
  patientEmail: string;
  /** Home-visit recommendations only: what the patient already has on file. */
  savedAddresses: SavedAddress[];
  /** Passed in from the server so the state does not flip at hydration. */
  nowMs: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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

  const snapshot = parseOfferSnapshot(offer.offerSnapshot);
  const state = carePlanState(
    { status: offer.planStatus as CarePlanStatus },
    { expires_at: offer.expiresAt },
    nowMs
  );

  function handlePay() {
    if (inFlight.current) return;
    if (offer.isHomeVisit && usingNewAddress) {
      if (!newAddress.line1.trim() || !newAddress.pincode.trim()) {
        setError("Add the address these visits should come to.");
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
      onSuccess: () => {
        inFlight.current = false;
        setPaying(false);
        router.refresh();
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
        </div>
      )}

      {actionable ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePay}
              disabled={paying}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {paying
                ? "Opening payment…"
                : snapshot
                  ? `Accept & pay ${formatInr(snapshot.pricePaise)}`
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
