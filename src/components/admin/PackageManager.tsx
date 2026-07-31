"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PackageForm from "./PackageForm";

type Package = {
  id: string;
  category_id: string;
  title: string;
  session_count: number;
  price_paise: number;
  display_order: number;
  active: boolean;
};

function DeleteButton({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm("Delete this package? This can't be undone.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/delete-package", {
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

export default function PackageManager({
  packages,
  categories,
}: {
  packages: Package[];
  categories: { id: string; title: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const categoryMap = new Map(categories.map((c) => [c.id, c.title]));

  return (
    <div className="space-y-3">
      {packages.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No session packages yet — add one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {packages.map((pkg) =>
            editingId === pkg.id ? (
              <li key={pkg.id}>
                <PackageForm
                  categories={categories}
                  pkg={pkg}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={pkg.id}
                className="p-4 rounded-xl border border-slate-200 text-xs space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{pkg.title}</p>
                    <p className="text-slate-500 mt-0.5">
                      {categoryMap.get(pkg.category_id) ?? "Unknown category"}
                    </p>
                  </div>
                  <span
                    className={`font-semibold px-2.5 py-1 rounded-full ${
                      pkg.active
                        ? "text-teal-700 bg-teal-50"
                        : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {pkg.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <p className="text-slate-500">
                    {pkg.session_count} sessions • ₹{(pkg.price_paise / 100).toFixed(2)} bundle
                    {" "}(₹{(pkg.price_paise / pkg.session_count / 100).toFixed(2)}/session)
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingId(pkg.id)}
                      className="text-[11px] text-teal-700 font-semibold hover:underline"
                    >
                      Edit
                    </button>
                    <DeleteButton id={pkg.id} />
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {categories.length === 0 ? (
        <p className="text-xs text-slate-400">
          Add a treatment category first before creating a package for it.
        </p>
      ) : addingNew ? (
        <PackageForm categories={categories} onCancel={() => setAddingNew(false)} />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add Package
        </button>
      )}
    </div>
  );
}
