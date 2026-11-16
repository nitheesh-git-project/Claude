"use client";

import { useState } from "react";
import {
  GRIEVANCE_ACK_HOURS,
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_LIMITS,
  GRIEVANCE_RESOLVE_DAYS,
  type GrievanceCategory,
} from "@/lib/dataRequests";

const INPUT = "w-full min-h-12 rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900";
const LABEL = "mb-1.5 block text-sm font-semibold text-slate-900";

/**
 * The complaint form at the foot of /grievances (POST /api/grievances). No
 * account needed. A reference comes back to quote, with the two promises the
 * law makes: acknowledged within GRIEVANCE_ACK_HOURS, resolved within
 * GRIEVANCE_RESOLVE_DAYS. The off-screen "website" field is the honeypot.
 */
export default function GrievanceForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<GrievanceCategory | "">("");
  const [bookingReference, setBookingReference] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/grievances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, category, bookingReference, message, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; reference?: string };
      if (!res.ok || !data.reference) {
        setError(data.error ?? "We couldn't send your complaint just now. Please try again.");
        return;
      }
      setReference(data.reference);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (reference) {
    return (
      <div role="status" className="rounded-2xl border border-teal-200 bg-teal-50 p-6" data-testid="grievance-sent">
        <h3 className="font-display text-lg font-bold text-teal-900">We have your complaint</h3>
        <p className="mt-2 text-sm leading-relaxed text-teal-900">
          Your reference is <strong className="font-mono">{reference}</strong>. Please quote it if you write to us.
          We will acknowledge it within {GRIEVANCE_ACK_HOURS} hours and aim to resolve it within{" "}
          {GRIEVANCE_RESOLVE_DAYS} days, replying to {email}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL}>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={GRIEVANCE_LIMITS.name} autoComplete="name" className={INPUT} required />
        </label>
        <label className="block">
          <span className={LABEL}>Email to reply to</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={GRIEVANCE_LIMITS.email} autoComplete="email" className={INPUT} required />
        </label>
        <label className="block">
          <span className={LABEL}>
            Phone <span className="font-normal text-slate-600">(optional)</span>
          </span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={GRIEVANCE_LIMITS.phone} autoComplete="tel" className={INPUT} />
        </label>
        <label className="block">
          <span className={LABEL}>What is it about?</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as GrievanceCategory)} className={INPUT} required>
            <option value="" disabled>
              Choose one
            </option>
            {GRIEVANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {GRIEVANCE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className={LABEL}>
          Booking or payment reference <span className="font-normal text-slate-600">(optional)</span>
        </span>
        <input value={bookingReference} onChange={(e) => setBookingReference(e.target.value)} maxLength={GRIEVANCE_LIMITS.bookingReference} className={INPUT} />
      </label>
      <label className="block">
        <span className={LABEL}>What happened, and what would you like us to do?</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={GRIEVANCE_LIMITS.message} rows={5} className={`${INPUT} min-h-32`} required />
      </label>
      {/* Honeypot: off-screen, out of the tab order, ignored by people. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      <p className="text-xs text-slate-600">Please do not include medical reports here; they are safer uploaded to your account.</p>
      {error && (
        <p role="alert" data-form-error className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="min-h-12 w-full rounded-xl bg-teal-700 px-5 text-base font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60 sm:w-auto"
      >
        {sending ? "Sending…" : "Send complaint"}
      </button>
    </form>
  );
}
