"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

async function saveSetting(key: string, value: boolean | number | string) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

/**
 * The one standing discount: what a patient pays for their first session.
 *
 * Read in its own query by the caller rather than through AdminSettings --
 * these are the newest columns on `site_settings`, and a database one apply
 * behind must lose this control rather than reset every other setting on
 * the page by failing the shared select.
 *
 * Off by default. A clinic that has not decided its acquisition price
 * should not be discounting by accident on the first deploy.
 */
export default function FirstSessionOfferForm({
  enabled,
  type,
  value,
  sampleListPricePaise,
}: {
  enabled: boolean;
  type: "fixed" | "percent";
  value: number;
  /** A real category price, so the preview quotes a figure the admin
   *  recognises rather than an invented one. */
  sampleListPricePaise: number | null;
}) {
  const router = useRouter();
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(enabled);
  const [isTogglePending, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [draftType, setDraftType] = useState<"fixed" | "percent">(type);
  const [draftValue, setDraftValue] = useState(
    type === "fixed" ? String(value / 100) : String(value)
  );
  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleToggle() {
    const next = !optimisticEnabled;
    setToggleError(null);
    startToggle(async () => {
      setOptimisticEnabled(next);
      try {
        await saveSetting("first_session_offer_enabled", next);
        router.refresh();
      } catch (e) {
        setToggleError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function handleSave() {
    const raw = Number(draftValue);
    if (!Number.isFinite(raw) || raw <= 0) {
      setSaveError("Enter an amount above zero.");
      return;
    }
    const stored = draftType === "fixed" ? Math.round(raw * 100) : Math.round(raw);
    if (draftType === "percent" && stored > 100) {
      setSaveError("A percentage cannot be more than 100.");
      return;
    }
    setSaveError(null);
    setSaved(false);
    startSave(async () => {
      try {
        await saveSetting("first_session_offer_type", draftType);
        await saveSetting("first_session_offer_value", stored);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  // What a patient would actually pay, shown against a real category price.
  // An offer configured without seeing its effect is how "50" gets typed
  // into a field that wanted paise.
  const preview = (() => {
    if (!sampleListPricePaise || sampleListPricePaise <= 0) return null;
    const raw = Number(draftValue);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const payable =
      draftType === "fixed"
        ? Math.round(raw * 100)
        : Math.floor(sampleListPricePaise * (1 - Math.min(100, raw) / 100));
    if (payable >= sampleListPricePaise) return "That is not less than the session price.";
    const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
    return `A ${inr(sampleListPricePaise)} session would cost a new patient ${inr(
      Math.max(100, payable)
    )}.`;
  })();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-sm text-slate-800">First session offer</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            What a patient pays for their very first session with the clinic. Applies to a video
            consultation only, once per patient — the server checks whether they have ever paid
            for a session before, so it cannot be claimed twice or asked for.
          </p>
          <p className="text-xs text-slate-400 mt-2 max-w-md">
            Home visits and programmes are never discounted by this: a programme comes from a
            therapist&apos;s recommendation, and a visit&apos;s travel fee is money that goes
            straight to the therapist.
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isTogglePending}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
            optimisticEnabled
              ? "bg-teal-700 hover:bg-teal-800 text-white"
              : "bg-slate-200 hover:bg-slate-300 text-slate-800"
          }`}
        >
          {optimisticEnabled ? "Running" : "Off"}
        </button>
      </div>
      {toggleError && <p className="text-[11px] text-red-600 mt-2">{toggleError}</p>}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="offer-type" className="block text-[11px] font-semibold text-slate-700">
              Offer
            </label>
            <select
              id="offer-type"
              value={draftType}
              onChange={(e) => {
                setDraftType(e.target.value as "fixed" | "percent");
                setSaved(false);
              }}
              className="mt-1 rounded-lg border border-slate-300 p-2 text-xs"
            >
              <option value="fixed">A set price</option>
              <option value="percent">A percentage off</option>
            </select>
          </div>
          <div>
            <label htmlFor="offer-value" className="block text-[11px] font-semibold text-slate-700">
              {draftType === "fixed" ? "They pay (₹)" : "Off the price (%)"}
            </label>
            <input
              id="offer-value"
              type="number"
              min={1}
              max={draftType === "percent" ? 100 : undefined}
              value={draftValue}
              onChange={(e) => {
                setDraftValue(e.target.value);
                setSaved(false);
              }}
              className="mt-1 w-28 rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-[11px] font-semibold text-teal-700">Saved.</span>}
        </div>
        {preview && <p className="mt-3 text-[11px] text-slate-600">{preview}</p>}
        {saveError && <p className="mt-2 text-[11px] text-red-600">{saveError}</p>}
      </div>
    </div>
  );
}
