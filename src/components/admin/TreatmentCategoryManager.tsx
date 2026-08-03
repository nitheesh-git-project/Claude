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

function MoveButtons({
  id,
  isFirst,
  isLast,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [loading, setLoading] = useState<"up" | "down" | null>(null);
  const router = useRouter();

  async function move(direction: "up" | "down") {
    setLoading(direction);
    await fetch("/api/admin/reorder-treatment-category", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, direction }),
    });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => move("up")}
        disabled={isFirst || loading !== null}
        title="Move up"
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <i className="fa-solid fa-chevron-up text-[10px]"></i>
      </button>
      <button
        onClick={() => move("down")}
        disabled={isLast || loading !== null}
        title="Move down"
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <i className="fa-solid fa-chevron-down text-[10px]"></i>
      </button>
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
  const [duplicateFrom, setDuplicateFrom] = useState<Category | null>(null);

  function startAddNew() {
    setDuplicateFrom(null);
    setAddingNew(true);
  }

  function startDuplicate(cat: Category) {
    // Always append at the very end (max existing order + 1) rather than
    // source.display_order + 1 — the latter can collide with whatever
    // category already occupies that number.
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.display_order), 0);
    setDuplicateFrom({ ...cat, display_order: maxOrder + 1 });
    setAddingNew(true);
  }

  function closeAddNew() {
    setAddingNew(false);
    setDuplicateFrom(null);
  }

  return (
    <div className="space-y-3">
      {categories.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No condition categories yet — add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {categories.map((cat, i) =>
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
                  <div className="flex items-center gap-2">
                    <MoveButtons
                      id={cat.id}
                      isFirst={i === 0}
                      isLast={i === categories.length - 1}
                    />
                    <div>
                      <p className="font-bold text-slate-900">{cat.title}</p>
                      {cat.description && (
                        <p className="text-slate-500 mt-0.5">{cat.description}</p>
                      )}
                    </div>
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
                      onClick={() => startDuplicate(cat)}
                      className="text-[11px] text-slate-600 font-semibold hover:underline"
                    >
                      Duplicate
                    </button>
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
        <TreatmentCategoryForm
          onCancel={closeAddNew}
          initialValues={
            duplicateFrom
              ? {
                  title: `${duplicateFrom.title} (Copy)`,
                  description: duplicateFrom.description,
                  points: duplicateFrom.points,
                  price_paise: duplicateFrom.price_paise,
                  duration_minutes: duplicateFrom.duration_minutes,
                  cta_label: duplicateFrom.cta_label,
                  display_order: duplicateFrom.display_order,
                  active: false,
                }
              : undefined
          }
        />
      ) : (
        <button
          onClick={startAddNew}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add Category
        </button>
      )}
    </div>
  );
}
