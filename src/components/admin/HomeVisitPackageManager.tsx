"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import HomeVisitPackageForm, { type HomeVisitPackage } from "./HomeVisitPackageForm";
import { useConfirm } from "@/lib/useConfirm";
import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";

function DeleteButton({ id }: { id: string }) {
  const [optimisticDeleted, setOptimisticDeleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    if (!(await confirm("Delete this home visit package? This can't be undone."))) return;
    setError(null);
    startTransition(async () => {
      setOptimisticDeleted(true);
      const res = await fetch("/api/admin/delete-home-visit-package", {
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
      {error && <span className="text-[11px] text-red-600 max-w-[220px] text-right">{error}</span>}
      {dialog}
    </div>
  );
}

export default function HomeVisitPackageManager({
  packages,
  categories,
}: {
  packages: HomeVisitPackage[];
  categories: { id: string; title: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-3">
      {packages.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No home visit packages yet — add one below. A single one-off visit is just a package with
          1 visit.
        </p>
      ) : (
        <ul className="space-y-3">
          {packages.map((pkg) => {
            const savings = computeHomeVisitSavings({
              visitCount: pkg.visit_count,
              pricePaise: pkg.price_paise,
              compareAtPaise: pkg.compare_at_paise,
            });
            return editingId === pkg.id ? (
              <li key={pkg.id}>
                <HomeVisitPackageForm
                  pkg={pkg}
                  categories={categories}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={pkg.id} className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {pkg.title}
                      {pkg.badge_label && (
                        <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          {pkg.badge_label}
                        </span>
                      )}
                      {pkg.highlight && (
                        <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                          Featured
                        </span>
                      )}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      <span className="font-mono">{pkg.package_code ?? "—"}</span>
                      {pkg.visit_count === 1 && <span> · Single visit</span>}
                    </p>
                  </div>
                  <span
                    className={`font-semibold px-2.5 py-1 rounded-full ${
                      pkg.active ? "text-teal-700 bg-teal-50" : "text-slate-500 bg-slate-100"
                    }`}
                  >
                    {pkg.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
                  <p className="text-slate-500">
                    {pkg.visit_count} {pkg.visit_count === 1 ? "visit" : "visits"} • ₹
                    {(pkg.price_paise / 100).toLocaleString("en-IN")} (₹
                    {(savings.perVisitPaise / 100).toLocaleString("en-IN")}/visit)
                    {savings.savingsPercent !== null && (
                      <span className="text-teal-700 font-semibold">
                        {" "}
                        · Save {savings.savingsPercent}%
                      </span>
                    )}
                    <span className="text-slate-400"> · {pkg.visit_duration_minutes} min</span>
                    {pkg.travel_fee_included && (
                      <span className="text-slate-400"> · Travel included</span>
                    )}
                    {pkg.therapist_locked && <span className="text-slate-400"> · Therapist locked</span>}
                    {pkg.validity_days && (
                      <span className="text-slate-400"> · {pkg.validity_days}d validity</span>
                    )}
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
            );
          })}
        </ul>
      )}

      {addingNew ? (
        <HomeVisitPackageForm categories={categories} onCancel={() => setAddingNew(false)} />
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          + Add Home Visit Package
        </button>
      )}
    </div>
  );
}
