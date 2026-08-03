"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FaqForm from "./FaqForm";

type Faq = {
  id: string;
  question: string;
  answer: string;
  display_order: number;
  active: boolean;
};

function DeleteButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm("Delete this FAQ? This can't be undone.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/delete-faq", {
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

export default function FaqManager({ faqs }: { faqs: Faq[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-3">
      {faqs.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">No FAQs yet — add one below.</p>
      ) : (
        <ul className="space-y-3">
          {faqs.map((f) =>
            editingId === f.id ? (
              <li key={f.id}>
                <FaqForm faq={f} onCancel={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={f.id} className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-bold text-slate-900">{f.question}</p>
                  <span
                    className={`font-semibold px-2.5 py-1 rounded-full ${
                      f.active ? "text-teal-700 bg-teal-50" : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {f.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">{f.answer}</p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-slate-400">Order: {f.display_order}</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingId(f.id)}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Edit
                    </button>
                    <DeleteButton id={f.id} />
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {addingNew ? (
        <FaqForm onCancel={() => setAddingNew(false)} />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add FAQ
        </button>
      )}
    </div>
  );
}
