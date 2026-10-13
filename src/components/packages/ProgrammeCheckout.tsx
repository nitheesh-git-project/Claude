"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { formatClinicDate } from "@/lib/formatDateTime";
import { payForCarePlan } from "@/lib/carePlanPayment";
import AddressForm from "@/components/booking/AddressForm";
import PromoCodeField, { type PromoPreviewAnswer } from "@/components/booking/PromoCodeField";
import ProgrammeCover from "@/components/packages/ProgrammeCover";
import { PaidAndUnscheduled, type CarePlanOffer, type SavedAddress } from "@/components/packages/CarePlanOfferCard";
import type { HomeVisitAddressForm } from "@/lib/homeVisitPayment";
import { carePlanState, parseOfferSnapshot, type CarePlanStatus } from "@/lib/carePlans";
import { formatRupees } from "@/lib/formatMoney";
import { formatPaiseForCountry, type CountryPricing } from "@/lib/countryPricing";
import { usePricing } from "@/components/pricing/PricingProvider";

const SUGGESTED = "/patient/dashboard/suggested";

function formatInr(paise: number) {
  return `₹${formatRupees(paise)}`;
}

/** What /api/care-plan/quote answers. Every figure is the server's. */
type ProgrammeQuote = {
  sessionCount: number;
  listPricePaise: number;
  discountPaise: number;
  payablePaise: number;
  travelState: "none" | "needs_address" | "unserviceable" | "unknown" | "ready";
  travelPerVisitPaise: number | null;
  travelPaise: number;
  travelIncluded: boolean;
  totalPaise: number | null;
  payable: boolean;
  promo: { code: string | null; error: string | null };
  promoCodesEnabled: boolean;
  pricing: CountryPricing | null;
};

type QuoteAnswer = { ok: true; quote: ProgrammeQuote } | { ok: false; error: string };

/**
 * Review & pay for a recommended programme.
 *
 * The step the Suggested card used to skip: it opened Razorpay directly, so
 * a promo code had nowhere to go and the total was read for the first time
 * inside the payment sheet. This is built to read like step 3 of the
 * booking wizard -- the same tinted summary, the same "Have a code?", the
 * same pinned Back / Pay bar on a phone -- because it is the same moment in
 * the same product.
 *
 * **Every figure on it comes from /api/care-plan/quote**, and the Pay button
 * opens Razorpay at the amount /api/care-plan/create-order resolves through
 * the same module. The browser sends the recommendation's id, a code's name
 * and which address; it never sends an amount. A quote that has not caught
 * up with what is on screen disables Pay rather than letting it charge a
 * figure nobody was shown.
 *
 * Pay guards with a synchronous ref, not only `disabled`: `disabled` lands a
 * render too late for a fast double-click, and this one opens a payment
 * window.
 */
export default function ProgrammeCheckout({
  offer,
  homeVisitEnabled,
  patientName,
  patientEmail,
  savedAddresses,
  promoCodesEnabled,
  nowMs,
  bulkScheduleMax,
  alreadyPaid = false,
}: {
  offer: CarePlanOffer;
  homeVisitEnabled: boolean;
  patientName: string;
  patientEmail: string;
  /** Home-visit programmes only: what the patient already has on file. */
  savedAddresses: SavedAddress[];
  /** The clinic's switch. Off, there is no code field at all. */
  promoCodesEnabled: boolean;
  /** From the server, so the state does not flip at hydration. */
  nowMs: number;
  bulkScheduleMax: number;
  /** The plan was paid for. Shown as such on a fresh visit; straight after
   *  paying here, the confirmation and scheduler below stay put. */
  alreadyPaid?: boolean;
}) {
  const snapshot = parseOfferSnapshot(offer.offerSnapshot);
  const { formatAmount, homeVisitsOffered } = usePricing();
  const noun = offer.isHomeVisit ? "visit" : "session";
  const count = snapshot?.sessionCount ?? 0;
  const addressGroupId = useId();

  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<{ purchaseId: string | null } | null>(null);
  const inFlight = useRef(false);

  // Where a home visit is delivered. Moved here from the card: the purchase
  // is booked against a saved address, and the travel fee in the total
  // depends on it. Defaults to the newest address on file.
  const [addressId, setAddressId] = useState<string | null>(savedAddresses[0]?.id ?? null);
  const [newAddress, setNewAddress] = useState<HomeVisitAddressForm>({ line1: "", pincode: "" });
  const usingNewAddress = addressId === null;
  const typedPincode = newAddress.pincode?.trim() ?? "";
  const newPincode = /^\d{6}$/.test(typedPincode) ? typedPincode : "";

  // The applied code, by name. Cleared when a later quote says it no longer
  // applies, and the field is remounted so it does not go on reading
  // "applied" beside a total without it.
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoFieldKey, setPromoFieldKey] = useState(0);
  const [promoNotice, setPromoNotice] = useState<string | null>(null);
  // Bumped to ask for a fresh quote after a refused payment attempt.
  const [nonce, setNonce] = useState(0);

  const addressBody = !offer.isHomeVisit
    ? {}
    : usingNewAddress
      ? { pincode: newPincode || null }
      : { addressId };
  const key = JSON.stringify({ ...addressBody, promoCode, nonce });

  // Answers kept by the inputs they were asked for, so a slow reply to an
  // older question can never be shown as the answer to the current one --
  // it is filed under its own key and simply not read.
  const [answers, setAnswers] = useState<Record<string, QuoteAnswer>>({});
  const asked = useRef(new Set<string>());

  async function requestQuote(code: string | null): Promise<QuoteAnswer> {
    try {
      const res = await fetch("/api/care-plan/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carePlanVersionId: offer.versionId, promoCode: code, ...addressBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 429 or a 503 is "we couldn't work it out just now", never a
        // refusal of the programme -- the sentence says which.
        return {
          ok: false,
          error:
            data.error ??
            (res.status === 429 || res.status >= 500
              ? "We couldn't update the total just now."
              : "This programme can't be paid for right now."),
        };
      }
      return { ok: true, quote: data as ProgrammeQuote };
    } catch {
      return { ok: false, error: "We couldn't reach the server to update the total." };
    }
  }

  // Re-quoted whenever what is on screen changes.
  useEffect(() => {
    if (alreadyPaid || paid) return;
    if (asked.current.has(key)) return;
    asked.current.add(key);
    const askedKey = key;
    const code = promoCode;
    (async () => {
      const answer = await requestQuote(code);
      setAnswers((prev) => ({ ...prev, [askedKey]: answer }));
      // A code that applied a moment ago and no longer does (its cap filled,
      // its window closed) is taken off rather than left showing as applied
      // beside a total that does not include it.
      if (answer.ok && code && answer.quote.promo.error) {
        setPromoNotice(`${code} can't be used now: ${answer.quote.promo.error}`);
        setPromoCode((now) => (now === code ? null : now));
        setPromoFieldKey((k) => k + 1);
      }
    })();
    // requestQuote reads the same inputs `key` is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, alreadyPaid, paid]);

  // The field's own check goes through the same quote, so "₹X off" beside
  // the code and the total below it come from one answer.
  async function previewCode(code: string): Promise<PromoPreviewAnswer> {
    const answer = await requestQuote(code);
    if (!answer.ok) return { error: answer.error };
    const q = answer.quote;
    if (q.promo.error) return { applies: false, message: q.promo.error };
    if (!q.promo.code || q.discountPaise <= 0) {
      return { applies: false, message: "That code doesn't take anything off this programme." };
    }
    // This answer already is the quote for the code about to be applied, so
    // the effect above need not ask again.
    const nextKey = JSON.stringify({ ...addressBody, promoCode: q.promo.code, nonce });
    asked.current.add(nextKey);
    setAnswers((prev) => ({ ...prev, [nextKey]: answer }));
    setPromoNotice(null);
    return { applies: true, code: q.promo.code, discountPaise: q.discountPaise, pricing: q.pricing };
  }

  const current = answers[key] ?? null;
  const quote = current?.ok ? current.quote : null;
  const quoteError = current && !current.ok ? current.error : null;
  const loading = !alreadyPaid && !paid && !current;

  const money = (paise: number) =>
    quote?.pricing ? formatPaiseForCountry(paise, quote.pricing) : formatInr(paise);
  const perSessionText = (paise: number) => (offer.isHomeVisit ? formatInr(paise) : formatAmount(paise));

  const state = carePlanState(
    { status: offer.planStatus as CarePlanStatus },
    { expires_at: offer.expiresAt },
    nowMs
  );
  const homeVisitWithdrawn = offer.isHomeVisit && (!homeVisitEnabled || !homeVisitsOffered);
  const actionable = !alreadyPaid && state === "awaiting_patient" && !homeVisitWithdrawn;
  const travelState = quote?.travelState ?? (offer.isHomeVisit ? "needs_address" : "none");

  function handlePay() {
    if (inFlight.current) return;
    if (offer.isHomeVisit) {
      if (usingNewAddress && !newAddress.line1.trim()) {
        setError("Add the address these visits should come to.");
        return;
      }
      if (usingNewAddress && !/^\d{6}$/.test(newAddress.pincode.trim())) {
        setError("Add the 6-digit pincode for this address.");
        return;
      }
      if (travelState === "unserviceable") {
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
      promoCode,
      name: patientName,
      email: patientEmail,
      description: snapshot?.title ? `${snapshot.title} programme` : "Treatment programme",
      onSuccess: ({ purchaseId }) => {
        inFlight.current = false;
        setPaying(false);
        // Lands on what they bought and the one step that turns it into
        // appointments -- never a blank screen at the highest-intent moment.
        setPaid({ purchaseId });
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      onError: (message) => {
        inFlight.current = false;
        setPaying(false);
        setError(message);
        // The order route may have refused a code or a price that moved
        // since this page last asked; ask again so the figures catch up.
        setNonce((n) => n + 1);
      },
      onDismiss: () => {
        inFlight.current = false;
        setPaying(false);
      },
    });
  }

  if (paid) {
    return (
      <PaidAndUnscheduled
        offer={offer}
        purchaseId={paid.purchaseId}
        sessionCount={count}
        minGapHours={snapshot?.minGapHours ?? null}
        maxPerWeek={snapshot?.maxPerWeek ?? null}
        validityDays={snapshot?.validityDays ?? null}
        bulkScheduleMax={bulkScheduleMax}
        nowMs={nowMs}
        doneHref={SUGGESTED}
      />
    );
  }

  if (alreadyPaid) {
    return (
      <div className="rounded-2xl border border-teal-300 bg-teal-50/50 p-6 text-center shadow-sm">
        <i aria-hidden className="fa-solid fa-circle-check text-2xl text-teal-700" />
        <h2 className="mt-2 font-display text-lg font-bold text-slate-900">
          This programme is already paid for
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
          Your {noun}s are waiting under Your programmes - pick times that suit you.
        </p>
        <Link
          href="/patient/dashboard/packages"
          className="mt-4 inline-flex rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          See your programmes
        </Link>
      </div>
    );
  }

  const payLabel = paying
    ? "Opening payment…"
    : loading
      ? "Working out your total…"
      : quote && quote.payable && quote.totalPaise !== null
        ? `Pay ${money(quote.totalPaise)}`
        : travelState === "needs_address"
          ? "Add your address to continue"
          : travelState === "unserviceable"
            ? "We don't visit this pincode yet"
            : "Continue to payment";
  const payDisabled =
    paying || loading || travelState === "needs_address" || travelState === "unserviceable";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      {/* What is being bought. */}
      <div className="min-w-0 space-y-6">
        <section
          aria-labelledby="programme-checkout-title"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <ProgrammeCover
            src={offer.cover?.src ?? snapshot?.imageUrl ?? null}
            focalX={offer.cover?.focalX}
            focalY={offer.cover?.focalY}
            className="h-44 sm:h-60"
            testId="checkout-cover"
          />
          <div className="p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              Recommended by {offer.therapistName}
            </p>
            <h2
              id="programme-checkout-title"
              className="mt-1 font-display text-xl font-bold text-slate-900"
            >
              {snapshot?.title ? `${snapshot.title} programme` : "Treatment programme"}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag>{offer.isHomeVisit ? "At your home" : "Video sessions"}</Tag>
              {offer.handsOnRequired && <Tag>Hands-on treatment</Tag>}
            </div>

            {snapshot && (
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
                <div>
                  <dt className="text-[11px] text-slate-500">{offer.isHomeVisit ? "Visits" : "Sessions"}</dt>
                  <dd className="text-sm font-bold text-slate-900">
                    {count}
                    {snapshot.perSessionPaise ? (
                      <span className="font-normal text-slate-500" data-price="">
                        {" "}× {perSessionText(snapshot.perSessionPaise)}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">How often</dt>
                  <dd className="text-sm font-bold text-slate-900">
                    {offer.frequencyPerWeek ? `${offer.frequencyPerWeek} a week` : "Flexible"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Each {noun}</dt>
                  <dd className="text-sm font-bold text-slate-900">
                    {snapshot.sessionDurationMinutes ? `${snapshot.sessionDurationMinutes} min` : "-"}
                  </dd>
                </div>
              </dl>
            )}

            {offer.clinicalRationale && (
              <figure className="mt-5 rounded-xl bg-slate-50 p-4">
                <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Why {offer.therapistName} recommends it
                </figcaption>
                <blockquote className="mt-1.5 text-sm italic leading-relaxed text-slate-700">
                  {offer.clinicalRationale}
                </blockquote>
              </figure>
            )}
            {offer.instructions && (
              <p className="mt-3 text-xs leading-relaxed text-slate-600">{offer.instructions}</p>
            )}
          </div>
        </section>

        {homeVisitWithdrawn && state === "awaiting_patient" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {homeVisitsOffered
              ? "Visits at home are paused at the moment, so this cannot be booked just now. Your therapist will be in touch about what to do instead."
              : "Home visits are only available in India, so this cannot be booked from where you are. Your therapist can suggest video sessions instead."}
          </p>
        )}

        {state !== "awaiting_patient" && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {state === "lapsed"
              ? "This recommendation has expired. Your therapist can send an updated one after your next session."
              : "This recommendation is no longer open."}
          </p>
        )}

        {/* Where a home visit goes. */}
        {actionable && offer.isHomeVisit && (
          <section
            aria-labelledby={`${addressGroupId}-title`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <h3 id={`${addressGroupId}-title`} className="font-display text-base font-bold text-slate-900">
              Where should we come?
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Your therapist travels to you for every visit. Travel for your area is shown in the
              total before you pay.
            </p>
            {savedAddresses.length > 0 && (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">Choose an address</legend>
                {savedAddresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                      addressId === a.id ? "border-teal-600 bg-teal-50/60" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`address-${offer.versionId}`}
                      className="mt-1 accent-teal-600"
                      checked={addressId === a.id}
                      onChange={() => setAddressId(a.id)}
                      disabled={paying}
                    />
                    <span className="min-w-0 break-words text-slate-700">
                      {a.label ? <span className="font-semibold">{a.label} · </span> : null}
                      {a.line1}
                      {a.city ? `, ${a.city}` : ""} - {a.pincode}
                    </span>
                  </label>
                ))}
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                    usingNewAddress ? "border-teal-600 bg-teal-50/60" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name={`address-${offer.versionId}`}
                    className="mt-1 accent-teal-600"
                    checked={usingNewAddress}
                    onChange={() => setAddressId(null)}
                    disabled={paying}
                  />
                  <span className="text-slate-700">Somewhere else</span>
                </label>
              </fieldset>
            )}
            {usingNewAddress && (
              <div className="mt-4 space-y-4">
                {/* The shared AddressForm leaves the pincode to the wizard's
                    area step, which this page does not have -- so it is asked
                    here, first, because the travel fee depends on it. */}
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Pincode</span>
                  <input
                    value={newAddress.pincode}
                    onChange={(e) =>
                      setNewAddress({ ...newAddress, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                    }
                    disabled={paying}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="6 digits"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </label>
                <AddressForm value={newAddress} onChange={setNewAddress} disabled={paying} />
              </div>
            )}
            {travelState === "unserviceable" && (
              <p className="mt-3 text-xs font-semibold text-amber-700" role="status">
                {"We don't visit that pincode yet. Try another address, or get in touch and we'll tell you when we do."}
              </p>
            )}
            {travelState === "unknown" && (
              <p className="mt-3 text-xs text-slate-500" role="status">
                {"We couldn't work out the travel fee for this address just now, so it isn't in the total yet. The payment window shows the full figure before you pay."}
              </p>
            )}
          </section>
        )}
      </div>

      {/* The price, the code and Pay -- beside the summary on a wide screen,
          below it on a phone. */}
      {actionable && (
        <aside aria-label="Price and payment" className="space-y-4 lg:sticky lg:top-24">
          <div className="space-y-3 rounded-2xl border border-teal-100 bg-teal-50 p-5" data-testid="programme-breakdown">
            <h3 className="font-display text-base font-bold text-slate-900">Your total</h3>
            <Row
              label={`${count} ${count === 1 ? noun : `${noun}s`}`}
              value={quote ? money(quote.listPricePaise) : "-"}
              struck={Boolean(quote && quote.discountPaise > 0)}
              testId="breakdown-programme"
            />
            {quote && quote.discountPaise > 0 && (
              <Row
                label={promoCode ? `Promo code ${promoCode}` : "Promo code"}
                value={`−${money(quote.discountPaise)}`}
                tone="discount"
                testId="breakdown-discount"
              />
            )}
            {offer.isHomeVisit && (
              <Row
                label={
                  quote?.travelState === "ready" && !quote.travelIncluded && quote.travelPerVisitPaise !== null
                    ? `Travel · ${formatInr(quote.travelPerVisitPaise)} × ${count} ${count === 1 ? "visit" : "visits"}`
                    : "Travel"
                }
                value={
                  quote?.travelState === "ready"
                    ? quote.travelIncluded
                      ? "Included"
                      : formatInr(quote.travelPaise)
                    : travelState === "unknown"
                      ? "Shown at payment"
                      : "Needs your address"
                }
                testId="breakdown-travel"
              />
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-teal-100 pt-3">
              <span className="text-sm font-semibold text-slate-700">Total to pay</span>
              <span className="font-display text-xl font-extrabold text-slate-900" data-testid="breakdown-total">
                {quote && quote.totalPaise !== null ? money(quote.totalPaise) : "-"}
              </span>
            </div>
            {/* Razorpay takes rupees only, so a visitor priced abroad is told
                the exact rupee figure their card will show. */}
            {quote?.pricing && quote.totalPaise !== null && (
              <p className="text-[11px] leading-snug text-slate-500">
                Charged as {formatInr(quote.totalPaise)} INR. Your bank converts it, so the amount on
                your statement may differ slightly.
              </p>
            )}
            {loading && (
              <p className="text-[11px] text-slate-500" role="status">
                Checking the latest price for you...
              </p>
            )}
            {quoteError && (
              <p className="text-[11px] font-semibold text-amber-700" role="status">
                {quoteError}{" "}
                <button
                  type="button"
                  onClick={() => setNonce((n) => n + 1)}
                  className="underline"
                >
                  Try again
                </button>
              </p>
            )}
          </div>

          {promoCodesEnabled && (
            <div>
              <PromoCodeField
                key={promoFieldKey}
                preview={previewCode}
                label="Have a promo code?"
                onApplied={(code) => {
                  setPromoCode(code);
                  if (code) setPromoNotice(null);
                }}
              />
              {promoNotice && (
                <p className="mt-2 text-[11px] text-amber-700" role="status">
                  {promoNotice}
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          <div className="space-y-2 text-xs text-slate-500">
            <p>
              <i aria-hidden className="fa-solid fa-lock mr-1 text-teal-600" />
              Secure payment via Razorpay. You pay once for the whole programme.
            </p>
            <p>
              <i aria-hidden className="fa-solid fa-calendar-check mr-1 text-teal-600" />
              {/* No "within N days": the validity is said only near its end
                  (patientExpiryNotice), never as a clock from the day of
                  payment. */}
              {`You book each ${noun} yourself afterwards, at times that suit you, and the clinic confirms each one.`}
            </p>
            {offer.expiresAt && (
              <p>
                <i aria-hidden className="fa-solid fa-clock mr-1 text-teal-600" />
                This price holds until {formatClinicDate(offer.expiresAt)}.
              </p>
            )}
          </div>

          {/* The wizard's step 3 bar: Back beside Pay. Not pinned here, as
              it is in the wizard -- the dashboard's own tab bar is fixed to
              the bottom of a phone and would sit over it. On a phone this
              column follows the summary, so Pay comes straight after the
              total it charges. */}
          <div className="flex gap-3">
            <Link
              href={SUGGESTED}
              className="flex w-1/3 items-center justify-center rounded-xl bg-slate-200 py-3.5 text-sm font-bold text-slate-800 transition hover:bg-slate-300"
            >
              Back
            </Link>
            <button
              type="button"
              onClick={handlePay}
              disabled={payDisabled}
              className="w-2/3 rounded-xl bg-teal-700 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-teal-800 disabled:opacity-60"
            >
              {payLabel}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  struck = false,
  tone = "plain",
  testId,
}: {
  label: string;
  value: string;
  struck?: boolean;
  tone?: "plain" | "discount";
  testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs" data-testid={testId}>
      <span className={tone === "discount" ? "text-teal-700" : "text-slate-500"}>{label}</span>
      <span
        className={`shrink-0 font-bold ${tone === "discount" ? "text-teal-700" : "text-slate-900"} ${
          struck ? "line-through opacity-60" : ""
        }`}
      >
        {value}
      </span>
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
