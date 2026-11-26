"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";

type Testimonial = {
  id: string;
  patient_name: string;
  quote: string;
  rating: number | null;
  condition_label: string | null;
  avatar_url: string | null;
  display_order: number;
  active: boolean;
  /** When an admin recorded the patient's written consent, or null. */
  consent_recorded_at?: string | null;
  consent_note?: string | null;
};

export default function TestimonialForm({
  testimonial,
  onCancel,
}: {
  testimonial?: Testimonial;
  onCancel?: () => void;
}) {
  const isEdit = !!testimonial;
  const [patientName, setPatientName] = useState(testimonial?.patient_name ?? "");
  const [quote, setQuote] = useState(testimonial?.quote ?? "");
  const [rating, setRating] = useState(
    testimonial?.rating !== null && testimonial?.rating !== undefined
      ? String(testimonial.rating)
      : ""
  );
  const [conditionLabel, setConditionLabel] = useState(testimonial?.condition_label ?? "");
  const [avatarUrl, setAvatarUrl] = useState(testimonial?.avatar_url ?? "");
  const [displayOrder, setDisplayOrder] = useState(
    testimonial ? String(testimonial.display_order) : "0"
  );
  const [consentGiven, setConsentGiven] = useState(!!testimonial?.consent_recorded_at);
  const [consentNote, setConsentNote] = useState(testimonial?.consent_note ?? "");
  // A story can only be live with consent on file, so a new one starts
  // hidden unless the admin is recording consent as they add it.
  const [active, setActive] = useState(testimonial ? testimonial.active && !!testimonial.consent_recorded_at : false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body = {
      ...(isEdit ? { id: testimonial!.id } : {}),
      patientName,
      quote,
      rating: rating.trim() === "" ? null : rating,
      conditionLabel,
      avatarUrl,
      displayOrder,
      active: consentGiven && active,
      consentGiven,
      consentNote,
    };

    const res = await fetch(
      isEdit ? "/api/admin/update-testimonial" : "/api/admin/create-testimonial",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    if (!isEdit) {
      setPatientName("");
      setQuote("");
      setRating("");
      setConditionLabel("");
      setDisplayOrder("0");
    }
    onCancel?.();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
    >
      {error && <p className="text-red-600">{error}</p>}
      <label className="block">
        <span className="block font-semibold mb-1">
          Patient Name{" "}
          <span className="font-normal text-slate-500">
            (e.g. &quot;Priya S.&quot; - consider privacy)
          </span>
        </span>
        <input
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </label>
      <label className="block">
        <span className="block font-semibold mb-1">Quote</span>
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          rows={3}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-semibold mb-1">
            Rating <span className="font-normal text-slate-500">(1-5, optional)</span>
          </span>
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">
            Condition <span className="font-normal text-slate-500">(optional)</span>
          </span>
          <input
            value={conditionLabel}
            onChange={(e) => setConditionLabel(e.target.value)}
            placeholder="e.g. Spine & Posture Rehabilitation"
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </label>
      </div>
      <label className="block">
        <span className="block font-semibold mb-1">
          Photo URL <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          className="w-full p-2 rounded-lg border border-slate-300"
        />
        <p className="mt-1 text-xs text-slate-500">
          A square portrait, shown as a circle beside the quote on Home and
          Our Mission. Left blank, it falls back to the patient&apos;s initial.
          Only publish a photo the patient has agreed to.
        </p>
      </label>
      <label className="block">
        <span className="block font-semibold mb-1">Order</span>
        <input
          type="number"
          step={1}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          required
          className="w-24 p-2 rounded-lg border border-slate-300"
        />
      </label>
      <fieldset className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <legend className="px-1 font-semibold text-slate-800">Consent</legend>
        <label className="flex items-start gap-2 font-semibold">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => {
              setConsentGiven(e.target.checked);
              if (!e.target.checked) setActive(false);
            }}
            className="mt-0.5 w-4 h-4 accent-teal-600"
          />
          <span>
            The patient has given written consent to publish this story
            <span className="block font-normal text-slate-500">
              Their words, the name shown and, if there is one, the photo. Without it the story is never shown.
            </span>
          </span>
        </label>
        {consentGiven && (
          <label className="block">
            <span className="block font-semibold mb-1">Where is the signed consent kept?</span>
            <input
              value={consentNote}
              onChange={(e) => setConsentNote(e.target.value)}
              placeholder="e.g. Signed form, 12 Dec, patient file"
              required
              minLength={5}
              maxLength={500}
              className="w-full p-2 rounded-lg border border-slate-300"
            />
          </label>
        )}
      </fieldset>
      <label className={`flex items-center gap-2 font-semibold ${consentGiven ? "" : "text-slate-400"}`}>
        <input
          type="checkbox"
          checked={consentGiven && active}
          disabled={!consentGiven}
          aria-describedby={consentGiven ? undefined : "testimonial-active-hint"}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 accent-teal-600"
        />
        Active (visible on the site)
      </label>
      {!consentGiven && (
        <p id="testimonial-active-hint" className="-mt-2 text-slate-500">
          Record the patient&apos;s consent above to show this story.
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-2 rounded-lg transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition"
        >
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Testimonial"}
        </button>
      </div>
    </form>
  );
}
