"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SessionFeedbackForm({
  appointmentId,
  role,
  existingRating,
  existingFeedback,
}: {
  appointmentId: string;
  role: "patient" | "therapist";
  existingRating: number | null;
  existingFeedback: string | null;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(existingRating !== null);
  const router = useRouter();

  if (submitted) {
    const shownRating = existingRating ?? rating;
    const shownFeedback = existingFeedback ?? feedback;
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs space-y-1">
        <p className="font-semibold text-amber-500 text-sm">
          {"★".repeat(shownRating)}
          <span className="text-slate-300">{"★".repeat(5 - shownRating)}</span>
        </p>
        {shownFeedback ? (
          <p className="text-teal-800">{shownFeedback}</p>
        ) : (
          <p className="text-teal-700">Thanks for your feedback!</p>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a star rating.");
      return;
    }
    setLoading(true);
    setError(null);
    const endpoint =
      role === "patient"
        ? "/api/appointments/submit-patient-feedback"
        : "/api/appointments/submit-therapist-feedback";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, rating, feedback }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not submit. Please try again.");
      return;
    }
    setSubmitted(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-2"
    >
      <p className="font-semibold text-amber-900">
        How did this session go?
      </p>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-1 text-2xl leading-none">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={(hoverRating || rating) >= n ? "text-amber-500" : "text-slate-300"}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        placeholder="Feedback (optional)"
        maxLength={1000}
        className="w-full p-2 rounded-lg border border-slate-300"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
      >
        {loading ? "Submitting..." : "Submit Rating"}
      </button>
    </form>
  );
}
