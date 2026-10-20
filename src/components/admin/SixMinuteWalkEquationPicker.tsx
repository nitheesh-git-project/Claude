"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";

export type SixMinuteWalkEquationOption = {
  key: string;
  /** The equation's name as printed under the figure ("..., US adults"). */
  label: string;
  /** Who it was drawn from. */
  population: string;
};

// Which predicted-distance equation the six-minute walk's "% of predicted"
// uses (site_settings.six_minute_walk_equation).
//
// "Not chosen yet" is a real option and the default: with it the walk guide
// says "formula not chosen yet" and shows no percentage, rather than quietly
// using another country's population. The US equation is selectable, and its
// label says "US adults" so nobody picks it thinking it is ours.
//
// Settings is Master Admin only, the same scope /api/admin/update-setting
// accepts (requireAdminScope("settings")), so this renders only where its
// route will take it. When the setting could not be read the choice is not
// drawn -- a radio showing "not chosen" would read as a fact rather than as
// "we couldn't check".
export default function SixMinuteWalkEquationPicker({
  options,
  chosen,
  readable,
}: {
  options: SixMinuteWalkEquationOption[];
  /** The chosen key, or null for "not chosen yet". */
  chosen: string | null;
  readable: boolean;
}) {
  const saveSetting = useSaveSetting();
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic(chosen);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: string | null) {
    if (next === optimistic) return;
    setError(null);
    setPending(true);
    startTransition(async () => {
      setOptimistic(next);
      try {
        await saveSetting("six_minute_walk_equation", next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      } finally {
        setPending(false);
      }
    });
  }

  const row = (key: string | null, title: string, detail: string) => (
    <label
      key={key ?? "none"}
      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
    >
      <input
        type="radio"
        name="six-minute-walk-equation"
        checked={optimistic === key}
        disabled={pending}
        onChange={() => choose(key)}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{detail}</span>
      </span>
    </label>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-sm font-bold text-slate-700">Six-minute walk: predicted distance</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        The walk&apos;s &quot;% of predicted&quot; is worked out from one published equation, named under the
        figure. Pick the one your senior physiotherapist has chosen and keep to it, so results stay comparable.
        Until one is picked, no percentage is shown; the distance walked is always recorded.
      </p>
      {!readable ? (
        <p className="mt-3 text-xs font-semibold text-amber-700" role="status">
          We couldn&apos;t check which equation is chosen just now, so no percentage of predicted is shown until this
          loads. Refresh to try again.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Six-minute walk equation">
          {row(null, "Not chosen yet", "No percentage of predicted is shown.")}
          {options.map((o) => row(o.key, o.label, o.population))}
        </div>
      )}
      {pending && <p className="mt-2 text-[11px] text-slate-500">Saving...</p>}
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
