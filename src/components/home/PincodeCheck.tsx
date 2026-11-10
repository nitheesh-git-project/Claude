"use client";

import { useId, useState } from "react";
import Link from "@/components/system/ProgressLink";
import { isValidPincodeShape, normalizePincode } from "@/lib/homeVisitAreas";
import { rateLimitNotice } from "@/lib/rateLimit";

type Result =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "served"; place: string }
  | { state: "not-served" }
  | { state: "error"; message: string };

/**
 * "Do you come to me?", answered where the question is asked.
 *
 * The /home-visit hero used to hold a button that went to a booking page whose
 * first screen asked for the pincode -- two page loads to learn whether the
 * service exists for you. This asks the same public endpoint the wizard asks
 * (`/api/home-visit/check-area`, unauthenticated and rate-limited) and answers
 * in place. It says nothing about price or travel fee: those depend on the
 * condition and the area and are shown, separately, before anything is paid.
 *
 * A failed lookup is "we couldn't check", never "we don't visit you" -- the
 * latter would send somebody away from a service the clinic does provide.
 */
export default function PincodeCheck() {
  const inputId = useId();
  const [pincode, setPincode] = useState("");
  const [result, setResult] = useState<Result>({ state: "idle" });

  async function check(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizePincode(pincode);
    if (!isValidPincodeShape(normalized)) {
      setResult({ state: "error", message: "Enter a valid 6-digit pincode." });
      return;
    }
    setResult({ state: "checking" });
    try {
      const res = await fetch(`/api/home-visit/check-area?pincode=${normalized}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({
          state: "error",
          message: rateLimitNotice(
            data.error ?? "We couldn't check that pincode just now. Please try again.",
            data.retryAfterSeconds
          ),
        });
        return;
      }
      if (!data.serviceable) {
        setResult({ state: "not-served" });
        return;
      }
      const area = data.area ?? {};
      setResult({
        state: "served",
        place: [area.areaName, area.city].filter(Boolean).join(", "),
      });
    } catch {
      setResult({ state: "error", message: "We couldn't check that. Please check your connection." });
    }
  }

  return (
    <div className="mt-6 max-w-md" data-testid="hero-pincode-check">
      <form onSubmit={check} className="flex gap-2" noValidate>
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            Your pincode
          </label>
          <input
            id={inputId}
            value={pincode}
            onChange={(e) => {
              setPincode(e.target.value);
              if (result.state !== "idle") setResult({ state: "idle" });
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={7}
            // Not a real pincode: an example that is (or was) served reads as
            // a promise to whoever lives there.
            placeholder="6-digit pincode"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <button
          type="submit"
          disabled={result.state === "checking"}
          className="h-12 shrink-0 rounded-xl bg-teal-700 px-5 text-base font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-70"
        >
          {result.state === "checking" ? "Checking..." : "Check"}
        </button>
      </form>

      <div aria-live="polite" className="mt-3 text-base">
        {result.state === "served" && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <i aria-hidden="true" className="fa-solid fa-circle-check mr-2 text-emerald-600" />
            Yes, we visit{result.place ? ` ${result.place}` : " you"}.{" "}
            <Link
              href="/book-home-visit"
              className="inline-flex min-h-11 items-center font-bold text-teal-800 underline underline-offset-4"
            >
              Book a home visit
            </Link>
          </p>
        )}
        {result.state === "not-served" && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            We don&apos;t visit that pincode yet. A video session works from anywhere.{" "}
            <Link
              href="/book"
              className="inline-flex min-h-11 items-center font-bold text-teal-800 underline underline-offset-4"
            >
              Book a video session
            </Link>
          </p>
        )}
        {result.state === "error" && (
          <p role="alert" className="text-red-700">
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
