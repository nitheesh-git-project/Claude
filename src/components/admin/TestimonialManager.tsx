"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import TestimonialForm from "./TestimonialForm";
import { useConfirm } from "@/lib/useConfirm";

type Testimonial = {
  id: string;
  patient_name: string;
  quote: string;
  rating: number | null;
  condition_label: string | null;
  display_order: number;
  active: boolean;
};

function DeleteButton({ id }: { id: string }) {
  // The parent only renders this row while the testimonial still exists, so
  // a real success unmounts it via router.refresh() before this optimistic
  // overlay would need to clear on its own -- a failure just reverts to the
  // base `false`. See PatientActiveToggle's comment.
  const [optimisticDeleted, setOptimisticDeleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    if (!(await confirm("Delete this testimonial? This can't be undone."))) return;
    setError(null);
    startTransition(async () => {
      setOptimisticDeleted(true);
      const res = await fetch("/api/admin/delete-testimonial", {
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

export default function TestimonialManager({ testimonials }: { testimonials: Testimonial[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-3">
      {testimonials.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No testimonials yet — add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {testimonials.map((t) =>
            editingId === t.id ? (
              <li key={t.id}>
                <TestimonialForm testimonial={t} onCancel={() => setEditingId(null)} />
              </li>
            ) : (
              <li
                key={t.id}
                className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {t.patient_name}
                      {t.rating && (
                        <span className="ml-2 text-amber-500">
                          {"★".repeat(t.rating)}
                          <span className="text-slate-300">{"★".repeat(5 - t.rating)}</span>
                        </span>
                      )}
                    </p>
                    {t.condition_label && (
                      <p className="text-slate-400 mt-0.5">{t.condition_label}</p>
                    )}
                  </div>
                  <span
                    className={`font-semibold px-2.5 py-1 rounded-full ${
                      t.active ? "text-teal-700 bg-teal-50" : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {t.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">&quot;{t.quote}&quot;</p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-slate-400">Order: {t.display_order}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingId(t.id)}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Edit
                    </button>
                    <DeleteButton id={t.id} />
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {addingNew ? (
        <TestimonialForm onCancel={() => setAddingNew(false)} />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add Testimonial
        </button>
      )}
    </div>
  );
}
