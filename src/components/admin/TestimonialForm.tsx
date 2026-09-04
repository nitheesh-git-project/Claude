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
  const [active, setActive] = useState(testimonial?.active ?? true);
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
      active,
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
      <div>
        <label className="block font-semibold mb-1">
          Patient Name{" "}
          <span className="font-normal text-slate-400">
            (e.g. &quot;Priya S.&quot; — consider privacy)
          </span>
        </label>
        <input
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">Quote</label>
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          rows={3}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">
            Rating <span className="font-normal text-slate-400">(1-5, optional)</span>
          </label>
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">
            Condition <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            value={conditionLabel}
            onChange={(e) => setConditionLabel(e.target.value)}
            placeholder="e.g. Spine & Posture Rehabilitation"
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
      </div>
      <div>
        <label className="block font-semibold mb-1">
          Photo URL <span className="font-normal text-slate-400">(optional)</span>
        </label>
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
      </div>
      <div>
        <label className="block font-semibold mb-1">Order</label>
        <input
          type="number"
          step={1}
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          required
          className="w-24 p-2 rounded-lg border border-slate-300"
        />
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 accent-teal-600"
        />
        Active (visible on the site)
      </label>
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
