"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TreatmentCategoryForm from "./TreatmentCategoryForm";

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

function DeleteButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm("Delete this category? This can't be undone.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/delete-treatment-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError(data.error ?? "Could not delete. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDelete}
        disabled={loading}
        className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60"
      >
        {loading ? "Deleting..." : "Delete"}
      </button>
      {error && <span className="text-[11px] text-red-600 max-w-[160px] text-right">{error}</span>}
    </div>
  );
}

export default function TreatmentCategoryManager({
  categories,
}: {
  categories: Category[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-3">
      {categories.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No condition categories yet — add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {categories.map((cat) =>
            editingId === cat.id ? (
              <li key={cat.id}>
                <TreatmentCategoryForm
                  category={cat}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={cat.id}
                className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {cat.title}{" "}
                      <span className="text-slate-400 font-normal">
                        (Order {cat.display_order})
                      </span>
                    </p>
                    {cat.description && (
                      <p className="text-slate-500 mt-0.5">{cat.description}</p>
                    )}
                  </div>
                  <span
                    className={`font-semibold px-2.5 py-1 rounded-full ${
                      cat.active
                        ? "text-teal-700 bg-teal-50"
                        : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {cat.active ? "Active" : "Inactive"}
                  </span>
                </div>
                {cat.points.length > 0 && (
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    {cat.points.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-slate-500">
                    ₹{(cat.price_paise / 100).toFixed(2)} •{" "}
                    {cat.duration_minutes} min • &quot;{cat.cta_label}&quot;
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingId(cat.id)}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Edit
                    </button>
                    <DeleteButton id={cat.id} />
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {addingNew ? (
        <TreatmentCategoryForm onCancel={() => setAddingNew(false)} />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add Category
        </button>
      )}
    </div>
  );
}
