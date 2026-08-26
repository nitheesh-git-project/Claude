"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import TreatmentCategoryForm from "./TreatmentCategoryForm";
import { useConfirm } from "@/lib/useConfirm";

type Category = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  points: string[];
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
  display_order: number;
  active: boolean;
};

function DeleteButton({ id }: { id: string }) {
  // The parent only renders this row while the category still exists, so a
  // real success unmounts it via router.refresh() before this optimistic
  // overlay would need to clear on its own -- a failure just reverts to the
  // base `false`. See PatientActiveToggle's comment.
  const [optimisticDeleted, setOptimisticDeleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    if (!(await confirm("Delete this category? This can't be undone."))) return;
    setError(null);
    startTransition(async () => {
      setOptimisticDeleted(true);
      const res = await fetch("/api/admin/delete-treatment-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete. Please try again.");
      }
    });
  }

  if (optimisticDeleted && !error) {
    return <span className="text-[11px] font-semibold text-slate-500">Deleting...</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60"
      >
        Delete
      </button>
      {error && <span className="text-[11px] text-red-600 max-w-[160px] text-right">{error}</span>}
      {dialog}
    </div>
  );
}

function MoveButtons({
  isFirst,
  isLast,
  isPending,
  onMove,
}: {
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onMove("up")}
        disabled={isFirst || isPending}
        title="Move up"
        className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <i className="fa-solid fa-chevron-up text-[10px]"></i>
      </button>
      <button
        onClick={() => onMove("down")}
        disabled={isLast || isPending}
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
  const [moveError, setMoveError] = useState<string | null>(null);
  const router = useRouter();

  // Prop-derived base: swapping two adjacent rows' positions is fully known
  // client-side the moment the button is clicked, so the list reorders
  // instantly instead of waiting on the fetch + router.refresh() round trip.
  // Reverts to the real prop order on failure (no refresh happens); matches
  // the new prop order on success once router.refresh() lands.
  const [optimisticCategories, setOptimisticCategories] = useOptimistic(categories);
  const [isMovePending, startMoveTransition] = useTransition();

  function handleMove(id: string, direction: "up" | "down") {
    const idx = optimisticCategories.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= optimisticCategories.length) return;
    const reordered = [...optimisticCategories];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    setMoveError(null);
    startMoveTransition(async () => {
      setOptimisticCategories(reordered);
      const res = await fetch("/api/admin/reorder-treatment-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, direction }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setMoveError("Could not reorder. Please try again.");
      }
    });
  }

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
      {moveError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {moveError}
        </p>
      )}
      {optimisticCategories.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No condition categories yet — add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {optimisticCategories.map((cat, i) =>
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
                      isFirst={i === 0}
                      isLast={i === optimisticCategories.length - 1}
                      isPending={isMovePending}
                      onMove={(direction) => handleMove(cat.id, direction)}
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
                  image_url: duplicateFrom.image_url,
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
