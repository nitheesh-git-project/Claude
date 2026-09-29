"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";

// One form for both of a therapist's two rates: the ordinary session share and
// the separate home-visit share. Rendered twice on the profile rather than
// forked, because the arithmetic on screen ("therapist X%, company 100-X%") and
// the range are the same judgement -- two copies is how they come to disagree
// about what 0 means or whether 100 is allowed.
//
// The one real difference is `clearable`. A blank ordinary share is a missing
// answer and the route refuses it; a blank home-visit share is a decision --
// "no separate rate, use the ordinary one" -- so it saves as null. That is a
// prop rather than a second component precisely because it is the only thing
// that differs.
export default function TherapistRevenueShareForm({
  therapistId,
  currentPercent,
  endpoint = "/api/admin/update-therapist-revenue-share",
  field = "revenueSharePercent",
  label = "Therapist %",
  clearable = false,
  /** What applies when this rate is not set. Shown in place of the figure, so
   *  an unset home-visit rate reads as the ordinary share taking over rather
   *  than as a blank nobody filled in. */
  fallbackNote,
}: {
  therapistId: string;
  currentPercent: number | null;
  endpoint?: string;
  field?: string;
  label?: string;
  clearable?: boolean;
  fallbackNote?: string;
}) {
  // Prop-derived base: reverts to the real prop on failure (no refresh
  // happens), matches the new prop on success once router.refresh() lands.
  const [optimisticPercent, setOptimisticPercent] = useOptimistic(currentPercent);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentPercent !== null ? String(currentPercent) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const parsed = Number(value);
  const companyPercent = value !== "" && !Number.isNaN(parsed) ? 100 - parsed : null;

  function handleSave() {
    if (value.trim() === "" && !clearable) {
      setError("Enter a percentage - leave it blank only if you want to cancel.");
      return;
    }
    setError(null);
    const blank = value.trim() === "";
    const newPercent = blank ? null : Number(value);
    startTransition(async () => {
      setOptimisticPercent(newPercent);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, [field]: blank ? null : value }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not update. Please try again.");
      }
    });
  }

  if (!editing) {
    return (
      <div className="text-xs">
        {optimisticPercent !== null ? (
          <p className="text-slate-600">
            Therapist gets <strong className="text-slate-900">{optimisticPercent}%</strong>{" "}
            of each session fee, company keeps{" "}
            <strong className="text-slate-900">{100 - optimisticPercent}%</strong>.
          </p>
        ) : (
          <p className="text-slate-500">
            {fallbackNote ?? "Not set yet - payouts can't be calculated."}
          </p>
        )}
        <button
          onClick={() => {
            setValue(optimisticPercent !== null ? String(optimisticPercent) : "");
            setError(null);
            setEditing(true);
          }}
          className="text-teal-700 font-semibold hover:underline mt-1"
        >
          {optimisticPercent !== null ? "Edit" : "Set Revenue Share"}
        </button>
      </div>
    );
  }

  return (
    <div className="text-xs space-y-2">
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex items-end gap-3">
        <label className="block">
          <span className="block font-semibold mb-1">{label}</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 p-2 rounded-lg border border-slate-300"
          />
        </label>
        <div>
          <label className="block font-semibold mb-1 text-slate-500">Company %</label>
          <div className="w-24 p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
            {companyPercent !== null ? `${companyPercent}%` : "-"}
          </div>
        </div>
      </div>
      {clearable && (
        <p className="text-[11px] text-slate-500">
          Leave it blank to use the ordinary session share for home visits too.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(false)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
