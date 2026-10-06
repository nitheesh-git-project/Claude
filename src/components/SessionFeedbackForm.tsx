"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "@/lib/useRouter";
import { composeFeedback, picksFor, ratingWord } from "@/lib/feedbackPicks";
import { FeedbackBody, StarIcon, StarRow } from "@/components/feedback/RatingDisplay";

// Where the thank-you's dots fly to: ten directions, three distances, so
// the burst reads as a burst rather than a ring.
const BURST = Array.from({ length: 10 }, (_, i) => {
  const angle = (i * 36 * Math.PI) / 180;
  const r = 44 + (i % 3) * 8;
  return {
    dx: Math.round(Math.cos(angle) * r),
    dy: Math.round(Math.sin(angle) * r),
    color: i % 2 ? "#14b8a6" : "#f59e0b",
  };
});

function firstName(name: string | null | undefined) {
  const first = name?.trim().split(/\s+/)[0];
  // "Dr Anjali Nair" reads as "Dr Anjali", not "Dr".
  if (first && /^dr\.?$/i.test(first)) {
    const second = name!.trim().split(/\s+/)[1];
    return second ? `Dr ${second}` : null;
  }
  return first || null;
}

/**
 * The rating card on a completed session, for the patient and for the
 * therapist. Five stars, then quick picks that suit the score, then an
 * optional note; the picks are saved as part of the feedback text (see
 * src/lib/feedbackPicks.ts), so nothing about how ratings are stored
 * changes. Sending ends on a short thank-you -- a tick and a small burst --
 * and the card then keeps a summary of what was said.
 */
export default function SessionFeedbackForm({
  appointmentId,
  role,
  existingRating,
  existingFeedback,
  counterpartName,
  viewerName,
}: {
  appointmentId: string;
  role: "patient" | "therapist";
  existingRating: number | null;
  existingFeedback: string | null;
  /** Who the session was with -- the therapist for a patient, the patient
   *  for a therapist. Optional: the card reads fine without it. */
  counterpartName?: string | null;
  /** The person rating, for the thank-you. */
  viewerName?: string | null;
}) {
  const [rating, setRating] = useState(0);
  // Bumped on every star tap so the pop replays even on the same star.
  const [tick, setTick] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // True only in the page where it was just sent: that is the one time the
  // thank-you animates. A later visit shows the summary still.
  const [justSent, setJustSent] = useState<{ rating: number; feedback: string } | null>(null);
  const router = useRouter();

  const other = firstName(counterpartName);
  const me = firstName(viewerName);

  // Already rated, on an earlier visit: the summary, no animation.
  if (existingRating !== null && !justSent) {
    return (
      <section
        aria-label="Your rating"
        className="space-y-2 rounded-2xl border border-teal-100 bg-teal-50/60 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">You rated this session</span>
          <StarRow rating={existingRating} size={16} />
          <span className="text-xs font-bold text-teal-800">{ratingWord(existingRating)}</span>
        </div>
        <FeedbackBody feedback={existingFeedback} />
      </section>
    );
  }

  if (justSent) {
    return (
      <section
        aria-live="polite"
        className="flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-teal-200 bg-teal-50 px-4 pb-4 pt-5 text-center"
      >
        <div className="relative h-16 w-16">
          {BURST.map((dot, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="fb-burst absolute left-[29px] top-[29px] h-[7px] w-[7px] rounded-full"
              style={{ background: dot.color, "--dx": `${dot.dx}px`, "--dy": `${dot.dy}px` } as CSSProperties}
            />
          ))}
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="fb-grow relative">
            <circle cx="32" cy="32" r="30" fill="#0f766e" />
            <path
              className="fb-draw"
              d="M20 33l8 8 16-17"
              fill="none"
              stroke="#ffffff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="fb-rise font-display text-lg font-bold text-slate-900" style={{ animationDelay: "420ms" }}>
          {me ? `Thank you, ${me}` : "Thank you"}
        </p>
        <p className="fb-rise text-sm text-slate-600" style={{ animationDelay: "500ms" }}>
          Your feedback is with the clinic.
        </p>
        <div
          className="fb-rise w-full space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-left"
          style={{ animationDelay: "600ms" }}
        >
          <div className="flex items-center justify-between">
            <StarRow rating={justSent.rating} size={18} />
            <span className="text-sm font-bold text-teal-800">{ratingWord(justSent.rating)}</span>
          </div>
          <FeedbackBody feedback={justSent.feedback} />
        </div>
      </section>
    );
  }

  const offered = picksFor(role, rating);

  function choose(n: number) {
    // A new score offers a different set of picks; keep only the ones that
    // still apply, so going from 2 stars to 4 does not carry "Started late".
    setPicks((current) => current.filter((p) => picksFor(role, n).includes(p)));
    setRating(n);
    setTick((t) => t + 1);
    setError(null);
  }

  function togglePick(p: string) {
    setPicks((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating === 0) {
      setError("Choose a star rating first.");
      return;
    }
    const feedback = composeFeedback(picks, note);
    if (feedback.length > 1000) {
      setError("That is a little long - keep it under 1,000 characters.");
      return;
    }
    setError(null);
    setSending(true);
    const endpoint =
      role === "patient"
        ? "/api/appointments/submit-patient-feedback"
        : "/api/appointments/submit-therapist-feedback";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, rating, feedback }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not send that. Please try again.");
        return;
      }
      setJustSent({ rating, feedback });
      router.refresh();
    } catch {
      setError("Could not reach the clinic. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const heading =
    role === "patient"
      ? other
        ? `How was your session with ${other}?`
        : "How was your session?"
      : other
        ? `How did the session with ${other} go?`
        : "How did the session go?";

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Rate this session"
      className="space-y-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-4"
    >
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Rate this session</p>
        <p className="mt-1 font-display text-base font-bold leading-snug text-slate-900">{heading}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {role === "patient" ? "Shared with the clinic." : `Shared with the clinic${other ? `, not with ${other}` : ""}.`}
        </p>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= rating;
          return (
            <button
              key={n}
              type="button"
              onClick={() => choose(n)}
              aria-pressed={n === rating}
              aria-label={`${n} star${n > 1 ? "s" : ""}, ${ratingWord(n)}`}
              className="relative flex h-12 w-12 items-center justify-center rounded-full transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              {n === rating && tick > 0 && (
                <span key={`ripple-${tick}`} aria-hidden="true" className="fb-ripple absolute inset-1 rounded-full bg-amber-200" />
              )}
              <StarIcon
                key={on ? `on-${tick}` : "off"}
                filled={on}
                size={34}
                className={`relative ${on && tick > 0 ? "fb-pop" : ""}`}
              />
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className={`-mt-1 text-sm font-bold ${rating ? "text-amber-700" : "text-slate-500"}`}>
        {rating ? ratingWord(rating) : "Tap a star"}
      </p>

      {rating > 0 && (
        <div className="fb-rise space-y-2.5">
          <p className="text-xs font-semibold text-slate-600">
            {rating <= 2 ? "What could have gone better?" : role === "patient" ? "What went well?" : "What stood out?"}
          </p>
          <div className="flex flex-wrap gap-2">
            {offered.map((p) => {
              const on = picks.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePick(p)}
                  className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold transition ${
                    on
                      ? "scale-[1.03] border-teal-700 bg-teal-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-teal-400"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <label htmlFor={`fb-note-${appointmentId}`} className="block text-xs font-semibold text-slate-600">
            Anything else? <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id={`fb-note-${appointmentId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={role === "patient" ? "What helped, or what could be better" : "Anything the clinic should know"}
            className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition ${
          rating ? "bg-teal-700 text-white hover:bg-teal-800" : "bg-slate-200 text-slate-600"
        } disabled:opacity-80`}
      >
        {sending && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        )}
        {sending ? "Sending…" : rating ? "Send feedback" : "Choose a rating to send"}
      </button>
    </form>
  );
}
