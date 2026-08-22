"use client";

import ListPager from "@/components/dashboard/ListPager";
import { usePagedList } from "@/lib/usePagedList";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import PackageCatalogForm from "./PackageCatalogForm";
import { useConfirm } from "@/lib/useConfirm";
import { computePackageSavings } from "@/lib/packageProgress";

type Package = {
  id: string;
  package_code: string | null;
  category_id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  promises: string[];
  badge_label: string | null;
  highlight: boolean;
  terms: string | null;
  session_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  display_order: number;
  therapist_rate_basis: "package_actual" | "category_list";
  validity_days: number | null;
  session_duration_minutes: number | null;
  therapist_locked: boolean;
  min_gap_hours: number | null;
  max_sessions_per_week: number | null;
  max_purchases_per_patient: number | null;
  visible_on_home: boolean;
  visible_on_conditions: boolean;
  visible_in_dashboard: boolean;
  active: boolean;
};

function DeleteButton({ id }: { id: string }) {
  const [optimisticDeleted, setOptimisticDeleted] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    if (!(await confirm("Delete this package? This can't be undone."))) return;
    setError(null);
    startTransition(async () => {
      setOptimisticDeleted(true);
      const res = await fetch("/api/admin/delete-package", {
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
      <button onClick={handleDelete} disabled={isPending} className="text-[11px] text-red-600 font-semibold hover:underline disabled:opacity-60">
        Delete
      </button>
      {error && <span className="text-[11px] text-red-600 max-w-[160px] text-right">{error}</span>}
      {dialog}
    </div>
  );
}

export default function PackageCatalogManager({
  packages,
  categories,
}: {
  packages: Package[];
  categories: { id: string; title: string; price_paise: number }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const { rows: pagePackages, pager } = usePagedList(packages, { storageKey: "admin-package-catalog" });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-3">
      {packages.length === 0 && !addingNew ? (
        <p className="text-xs text-slate-500 py-4 text-center">No session packages yet — add one below.</p>
      ) : (
        <ul className="space-y-3">
          {pagePackages.map((pkg) => {
            const category = categoryMap.get(pkg.category_id);
            const savings = computePackageSavings({
              sessionCount: pkg.session_count,
              pricePaise: pkg.price_paise,
              compareAtPaise: pkg.compare_at_paise,
              categoryPricePaise: category?.price_paise ?? null,
            });
            return editingId === pkg.id ? (
              <li key={pkg.id}>
                <PackageCatalogForm categories={categories} pkg={pkg} onCancel={() => setEditingId(null)} />
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
                      {category?.title ?? "Unknown category"} · <span className="font-mono">{pkg.package_code ?? "—"}</span>
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
                    {pkg.session_count} sessions • ₹{(pkg.price_paise / 100).toFixed(2)} bundle (₹
                    {savings.perSessionPaise / 100}/session)
                    {savings.savingsPercent !== null && (
                      <span className="text-teal-700 font-semibold"> · Save {savings.savingsPercent}%</span>
                    )}
                    {pkg.therapist_locked && <span className="text-slate-400"> · Therapist locked</span>}
                    {pkg.validity_days && <span className="text-slate-400"> · {pkg.validity_days}d validity</span>}
                  </p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setEditingId(pkg.id)} className="text-[11px] text-teal-700 font-semibold hover:underline">
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
      <ListPager pager={pager} noun="package" />

      {categories.length === 0 ? (
        <p className="text-xs text-slate-400">Add a treatment category first before creating a package for it.</p>
      ) : addingNew ? (
        <PackageCatalogForm categories={categories} onCancel={() => setAddingNew(false)} />
      ) : (
        <button onClick={() => setAddingNew(true)} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl transition">
          + Add Package
        </button>
      )}
    </div>
  );
}
