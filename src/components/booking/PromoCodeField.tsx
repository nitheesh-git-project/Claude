"use client";

import { useRef, useState } from "react";
import { isWellFormedPromoCode, normalizePromoCode } from "@/lib/promoCodes";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

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
  onApplied,
}: {
  categoryId?: string | null;
  appointmentId?: string | null;
  /** The applied code, or null when it is cleared. The parent sends it on to
   *  checkout; it never sends an amount. */
  onApplied: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [applied, setApplied] = useState<{ code: string; discountPaise: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // A synchronous guard, not the disabled attribute: a disabled prop lands a
  // render too late to stop a double tap.
  const inFlight = useRef(false);

  async function check() {
    if (inFlight.current) return;
    const normalized = normalizePromoCode(code);
    if (!isWellFormedPromoCode(normalized)) {
      setMessage("That code isn't recognised.");
      return;
    }
    inFlight.current = true;
    setChecking(true);
    setMessage(null);
    try {
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
        setMessage(data.error ?? "That code couldn't be checked. Please try again.");
        return;
      }
      if (!data.applies) {
        setApplied(null);
        onApplied(null);
        setMessage(data.message ?? "That code isn't recognised.");
        return;
      }
      setApplied({ code: data.code, discountPaise: data.discountPaise });
      onApplied(data.code);
      setMessage(null);
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
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
          <span className="font-mono font-bold">{applied.code}</span> applied —{" "}
          {formatInr(applied.discountPaise)} off
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
        Have a code?
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
          onClick={check}
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
