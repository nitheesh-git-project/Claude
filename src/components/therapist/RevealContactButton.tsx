"use client";

import { useRef, useState } from "react";

/**
 * Shows the masked number, and asks for the real one.
 *
 * The masked string is rendered by the server and is all that is in the
 * page: this component has nothing to un-hide locally, so revealing is a
 * round trip by construction rather than by convention. That is what makes
 * the log entry unavoidable -- there is no client-side path to the number
 * to forget to instrument.
 *
 * Guards the submit with a synchronous ref rather than a `disabled`
 * attribute, the rule the suggestion controls document: `disabled` lands a
 * render too late for a double tap, and a double tap here would write two
 * reveal rows for one ask and make the log read as harvesting.
 */
export default function RevealContactButton({
  appointmentId,
  masked,
}: {
  appointmentId: string;
  masked: string;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function reveal() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/therapist/reveal-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not show the number.");
        return;
      }
      setPhone(data.phone as string);
    } catch {
      setError("Could not show the number. Check your connection.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  if (phone) {
    return (
      <a href={`tel:${phone}`} className="font-semibold text-teal-700 hover:underline">
        {phone}
      </a>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-slate-500">{masked}</span>
      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        className="text-[11px] font-semibold text-teal-700 transition hover:text-teal-800 disabled:opacity-60"
      >
        {loading ? "Showing…" : "Show number"}
      </button>
      {error && <span className="text-[11px] font-semibold text-amber-700">{error}</span>}
    </span>
  );
}
