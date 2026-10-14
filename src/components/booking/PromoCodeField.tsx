"use client";

import { useEffect, useRef, useState } from "react";
import { isWellFormedPromoCode, normalizePromoCode } from "@/lib/promoCodes";
import { formatRupees } from "@/lib/formatMoney";
import { formatPaiseForCountry, type CountryPricing } from "@/lib/countryPricing";

function formatInr(paise: number) {
  return `₹${formatRupees(paise)}`;
}

/** What a check of a typed code came back with. */
export type PromoPreviewAnswer =
  | { applies: true; code: string; discountPaise: number; pricing: CountryPricing | null }
  | { applies: false; message: string }
  | { error: string };

/**
 * "Have a code?" at checkout.
 *
 * Collapsed until asked for, deliberately. An open code box on a payment
 * screen tells every patient who does not have one that there is a discount
 * they are missing, and sends them to a search engine instead of to the
 * Pay button.
 *
 * What it sends is the code, never an amount: the figure it shows comes back
 * from the server, and the order that follows re-derives it under a lock. So
 * a stale preview can only ever show the patient a discount they then do not
 * get -- at which point checkout refuses rather than charging them silently
 * at list price, which is the one outcome a payment screen must not produce.
 */
export default function PromoCodeField({
  categoryId,
  appointmentId,
  initialCode = null,
  onApplied,
  preview,
  label = "Have a code?",
}: {
  categoryId?: string | null;
  appointmentId?: string | null;
  /** A code applied on an earlier, unpaid attempt at this booking. Checked
   *  again on mount -- shown as applied, or with the reason it no longer is
   *  -- so a patient finishing payment later neither loses it silently nor
   *  is charged for one that has since run out. */
  initialCode?: string | null;
  /** The applied code, or null when it is cleared. The parent sends it on to
   *  checkout; it never sends an amount. */
  onApplied: (code: string | null) => void;
  /** How a code is checked, when it is not a session's. A programme's
   *  review page asks its own quote route, so the code is judged against the
   *  programme (and its "valid on programmes" switch) rather than a single
   *  session's price. Defaults to /api/patient/promo-code/preview. */
  preview?: (code: string) => Promise<PromoPreviewAnswer>;
  /** The collapsed link's wording. */
  label?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode ?? "");
  const [checking, setChecking] = useState(false);
  const [applied, setApplied] = useState<{
    code: string;
    discountPaise: number;
    /** The country the server priced the preview for, or null for rupees. */
    pricing: CountryPricing | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // A synchronous guard, not the disabled attribute: a disabled prop lands a
  // render too late to stop a double tap.
  const inFlight = useRef(false);

  // The earlier attempt's code, re-checked once.
  const initialChecked = useRef(false);
  useEffect(() => {
    if (!initialCode || initialChecked.current) return;
    initialChecked.current = true;
    void check(initialCode, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  async function check(typed: string = code, fromEarlierTry = false) {
    if (inFlight.current) return;
    const normalized = normalizePromoCode(typed);
    if (!isWellFormedPromoCode(normalized)) {
      setMessage("That code isn't recognised.");
      return;
    }
    inFlight.current = true;
    setChecking(true);
    setMessage(null);
    try {
      const answer = preview ? await preview(normalized) : await previewSessionCode(normalized);
      if ("error" in answer) {
        setMessage(answer.error);
        return;
      }
      if (!answer.applies) {
        setApplied(null);
        onApplied(null);
        const reason = answer.message || "That code isn't recognised.";
        setMessage(
          fromEarlierTry
            ? `${normalized} from your last try can't be used now: ${reason}`
            : reason
        );
        return;
      }
      setApplied({ code: answer.code, discountPaise: answer.discountPaise, pricing: answer.pricing });
      onApplied(answer.code);
      setMessage(null);
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }

  /** The session preview: a booking, or the category the wizard is about to
   *  book. */
  async function previewSessionCode(normalized: string): Promise<PromoPreviewAnswer> {
    const res = await fetch("/api/patient/promo-code/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: normalized,
        ...(appointmentId ? { appointmentId } : {}),
        ...(categoryId ? { categoryId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error ?? "That code couldn't be checked. Please try again." };
    }
    if (!data.applies) {
      return { applies: false, message: data.message ?? "That code isn't recognised." };
    }
    return {
      applies: true,
      code: data.code,
      discountPaise: data.discountPaise,
      pricing: data.pricing ?? null,
    };
  }

  function clear() {
    setApplied(null);
    setCode("");
    setMessage(null);
    onApplied(null);
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
        <p className="text-xs text-teal-900">
          <span className="font-mono font-bold">{applied.code}</span> applied -{" "}
          {applied.pricing ? formatPaiseForCountry(applied.discountPaise, applied.pricing) : formatInr(applied.discountPaise)} off
        </p>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] font-semibold text-teal-800 underline"
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-slate-500 underline"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="promo-code-field">
          Promo code
        </label>
        <input
          id="promo-code-field"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setMessage(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="Enter code"
          className="flex-1 rounded-xl border border-slate-300 p-2.5 text-xs uppercase"
        />
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {checking ? "Checking…" : "Apply"}
        </button>
      </div>
      {message && <p className="text-[11px] text-amber-700">{message}</p>}
    </div>
  );
}
