"use client";

import FilterChips from "@/components/dashboard/FilterChips";
import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import FaqForm from "./FaqForm";
import { useConfirm } from "@/lib/useConfirm";

type Faq = {
  id: string;
  question: string;
  answer: string;
  display_order: number;
  active: boolean;
};

function DeleteButton({ id }: { id: string }) {
  // The parent only renders this row while the FAQ still exists, so a real
  // success unmounts it via router.refresh() before this optimistic overlay
  // would need to clear on its own -- a failure just reverts to the base
  // `false`. See PatientActiveToggle's comment.
  const [optimisticDeleted, setOptimisticDeleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    if (!(await confirm("Delete this FAQ? This can't be undone."))) return;
    setError(null);
    startTransition(async () => {
      setOptimisticDeleted(true);
      const res = await fetch("/api/admin/delete-faq", {
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

export default function FaqManager({ faqs }: { faqs: Faq[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"all" | "active" | "inactive">("all");
  const [addingNew, setAddingNew] = useState(false);
  const visible = faqs.filter((row) =>
    visibility === "all" ? true : visibility === "active" ? row.active : !row.active
  );
  const { rows: pageFaqs, pager } = usePagedList(visible, { storageKey: "admin-faqs" });

  return (
    <div className="space-y-3">
      {faqs.length > 1 && (
        <FilterChips
          label="Filter FAQs"
          value={visibility}
          onChange={setVisibility}
          choices={[
            { key: "all", label: "All", count: faqs.length },
            { key: "active", label: "Shown on the site", count: faqs.filter((r) => r.active).length },
            { key: "inactive", label: "Hidden", count: faqs.filter((r) => !r.active).length },
          ]}
        />
      )}
      {faqs.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">No FAQs yet — add one below.</p>
      ) : (
        <ul className="space-y-3">
          {pageFaqs.map((f) =>
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
      <ListPager pager={pager} noun="FAQ" />

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
