"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Package = {
  id: string;
  category_id: string;
  title: string;
  session_count: number;
  price_paise: number;
  display_order: number;
  active: boolean;
};

export default function PackageForm({
  categories,
  pkg,
  defaultCategoryId,
  onCancel,
}: {
  categories: { id: string; title: string }[];
  pkg?: Package;
  /** Prefills the category picker when adding a new package from a specific category's row. */
  defaultCategoryId?: string;
  onCancel?: () => void;
}) {
  const isEdit = !!pkg;
  const [categoryId, setCategoryId] = useState(
    pkg?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? ""
  );
  const [title, setTitle] = useState(pkg?.title ?? "");
  const [sessionCount, setSessionCount] = useState(pkg ? String(pkg.session_count) : "5");
  const [priceInr, setPriceInr] = useState(pkg ? String(pkg.price_paise / 100) : "");
  const [displayOrder, setDisplayOrder] = useState(pkg ? String(pkg.display_order) : "0");
  const [active, setActive] = useState(pkg?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body = {
      ...(isEdit ? { id: pkg!.id } : { categoryId }),
      title,
      sessionCount,
      priceInr,
      displayOrder,
      active,
    };

    const res = await fetch(isEdit ? "/api/admin/update-package" : "/api/admin/create-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    if (!isEdit) {
      setTitle("");
      setSessionCount("5");
      setPriceInr("");
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
      {!isEdit && (
        <div>
          <label className="block font-semibold mb-1">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300 bg-white"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block font-semibold mb-1">Package Name</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 5-Session Rehab Course"
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">Sessions Included</label>
          <input
            type="number"
            min={2}
            step="1"
            value={sessionCount}
            onChange={(e) => setSessionCount(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Bundle Price (₹)</label>
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
      </div>
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
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Package"}
        </button>
      </div>
    </form>
  );
}
