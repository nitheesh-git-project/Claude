"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Category = {
  id: string;
  title: string;
  description: string | null;
  points: string[];
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
  display_order: number;
  active: boolean;
};

export default function TreatmentCategoryForm({
  category,
  onCancel,
}: {
  category?: Category;
  onCancel?: () => void;
}) {
  const isEdit = !!category;
  const [title, setTitle] = useState(category?.title ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [pointsText, setPointsText] = useState((category?.points ?? []).join("\n"));
  const [priceInr, setPriceInr] = useState(
    category ? String(category.price_paise / 100) : ""
  );
  const [durationMinutes, setDurationMinutes] = useState(
    category ? String(category.duration_minutes) : "60"
  );
  const [ctaLabel, setCtaLabel] = useState(category?.cta_label ?? "Book Assessment");
  const [displayOrder, setDisplayOrder] = useState(
    category ? String(category.display_order) : "0"
  );
  const [active, setActive] = useState(category?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const points = pointsText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    const body = {
      ...(isEdit ? { id: category!.id } : {}),
      title,
      description,
      points,
      priceInr,
      durationMinutes,
      ctaLabel,
      displayOrder,
      active,
    };

    const res = await fetch(
      isEdit
        ? "/api/admin/update-treatment-category"
        : "/api/admin/create-treatment-category",
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
      setTitle("");
      setDescription("");
      setPointsText("");
      setPriceInr("");
      setDurationMinutes("60");
      setCtaLabel("Book Assessment");
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
        <label className="block font-semibold mb-1">Category Name</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">
          Tick Points{" "}
          <span className="font-normal text-slate-400">(one per line)</span>
        </label>
        <textarea
          value={pointsText}
          onChange={(e) => setPointsText(e.target.value)}
          rows={4}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">Price (₹)</label>
          <input
            type="number"
            min={1}
            step="0.01"
            value={priceInr}
            onChange={(e) => setPriceInr(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Session Length (min)</label>
          <input
            type="number"
            min={1}
            step="1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">Order</label>
          <input
            type="number"
            step="1"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Button Text</label>
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Book Assessment"
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 accent-teal-600"
        />
        Active (visible to patients)
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
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Category"}
        </button>
      </div>
    </form>
  );
}
