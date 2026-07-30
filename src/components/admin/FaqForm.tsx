"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Faq = {
  id: string;
  question: string;
  answer: string;
  display_order: number;
  active: boolean;
};

export default function FaqForm({
  faq,
  onCancel,
}: {
  faq?: Faq;
  onCancel?: () => void;
}) {
  const isEdit = !!faq;
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [displayOrder, setDisplayOrder] = useState(faq ? String(faq.display_order) : "0");
  const [active, setActive] = useState(faq?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body = {
      ...(isEdit ? { id: faq!.id } : {}),
      question,
      answer,
      displayOrder,
      active,
    };

    const res = await fetch(isEdit ? "/api/admin/update-faq" : "/api/admin/create-faq", {
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
      setQuestion("");
      setAnswer("");
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
        <label className="block font-semibold mb-1">Question</label>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">Answer</label>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
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
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Add FAQ"}
        </button>
      </div>
    </form>
  );
}
