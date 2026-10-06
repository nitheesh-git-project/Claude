"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { StarRow } from "@/components/feedback/RatingDisplay";

export default function RatingManager({
  title,
  average,
  count,
  excludedCount,
  distribution,
  visible,
  onToggleVisible,
}: {
  title: string;
  average: number | null;
  count: number;
  excludedCount: number;
  /** Included ratings per star, index 0 = one star (computeRatingAggregate).
   *  Drawn as a bar per star level so a 4.2 made of fives and ones reads
   *  differently from a 4.2 made of fours. */
  distribution?: number[];
  visible?: boolean;
  onToggleVisible?: { therapistId: string };
}) {
  // Prop-derived base: flips the label instantly instead of waiting on the
  // fetch + router.refresh() round trip. Reverts to the real `visible` prop
  // on failure (no refresh happens); matches the new prop on success once
  // router.refresh() lands. Falls back to `false` when this instance has no
  // toggle at all (visible is undefined) -- that branch never renders the
  // button, so the fallback value is never shown.
  const [optimisticVisible, setOptimisticVisible] = useOptimistic(visible ?? false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggleVisible() {
    if (!onToggleVisible || visible === undefined) return;
    const next = !visible;
    setError(null);
    startTransition(async () => {
      setOptimisticVisible(next);
      const res = await fetch("/api/admin/set-therapist-rating-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId: onToggleVisible.therapistId, visible: next }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  const bars = distribution ?? [0, 0, 0, 0, 0];
  const tallest = Math.max(1, ...bars);
  const rounded = average === null ? 0 : Math.round(average);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-teal-700">{title}</h2>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
      <div className="mt-3 grid gap-6 md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_240px] xl:items-center">
        <div>
          {average === null ? (
            <p className="text-sm text-slate-500 py-2">No ratings yet.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-4xl font-bold text-slate-900">{average.toFixed(1)}</span>
                <StarRow rating={rounded} size={18} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                From {count} rating{count === 1 ? "" : "s"}
                {excludedCount > 0 && ` · ${excludedCount} excluded`}
              </p>
            </>
          )}
          {excludedCount > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Excluded ratings stay visible on their own session.
            </p>
          )}
        </div>

        <ul className="space-y-1.5" aria-label="Ratings by star">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = bars[star - 1] ?? 0;
            return (
              <li key={star} className="grid grid-cols-[28px_minmax(0,1fr)_32px] items-center gap-2.5 text-xs">
                <span className="font-semibold text-slate-700">
                  {star}
                  <span aria-hidden="true">★</span>
                  <span className="sr-only"> star{star === 1 ? "" : "s"}</span>
                </span>
                <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-amber-400 transition-[width] duration-500"
                    style={{ width: `${Math.round((n / tallest) * 100)}%` }}
                  />
                </span>
                <span className="text-right text-slate-600">{n}</span>
              </li>
            );
          })}
        </ul>

        {onToggleVisible && visible !== undefined && (
          <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={optimisticVisible}
                aria-label="Show this rating on the public pages"
                onClick={handleToggleVisible}
                disabled={isPending}
                className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
                  optimisticVisible ? "bg-teal-700" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    optimisticVisible ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-sm font-semibold text-slate-800">
                {optimisticVisible ? "Shown on the public pages" : "Hidden from the public pages"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {optimisticVisible
                ? "Patients see the average and the count."
                : "Only admins can see it."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
