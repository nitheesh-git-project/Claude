"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

function inputCls() {
  return "w-full p-2 rounded-lg border border-slate-300 text-xs";
}

export default function PackageCatalogForm({
  categories,
  pkg,
  defaultCategoryId,
  onCancel,
}: {
  categories: { id: string; title: string; price_paise: number }[];
  pkg?: Package;
  defaultCategoryId?: string;
  onCancel?: () => void;
}) {
  const isEdit = !!pkg;
  const [categoryId] = useState(pkg?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "");
  const [title, setTitle] = useState(pkg?.title ?? "");
  const [subtitle, setSubtitle] = useState(pkg?.subtitle ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [imageUrl, setImageUrl] = useState(pkg?.image_url ?? "");
  const [promisesText, setPromisesText] = useState((pkg?.promises ?? []).join("\n"));
  const [badgeLabel, setBadgeLabel] = useState(pkg?.badge_label ?? "");
  const [highlight, setHighlight] = useState(pkg?.highlight ?? false);
  const [terms, setTerms] = useState(pkg?.terms ?? "");

  const [sessionCount, setSessionCount] = useState(pkg ? String(pkg.session_count) : "5");
  const [priceInr, setPriceInr] = useState(pkg ? String(pkg.price_paise / 100) : "");
  const [compareAtInr, setCompareAtInr] = useState(
    pkg?.compare_at_paise ? String(pkg.compare_at_paise / 100) : ""
  );
  const [displayOrder, setDisplayOrder] = useState(pkg ? String(pkg.display_order) : "0");
  const [therapistRateBasis, setTherapistRateBasis] = useState<"package_actual" | "category_list">(
    pkg?.therapist_rate_basis ?? "package_actual"
  );

  const [validityDays, setValidityDays] = useState(pkg?.validity_days ? String(pkg.validity_days) : "");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(
    pkg?.session_duration_minutes ? String(pkg.session_duration_minutes) : ""
  );
  const [therapistLocked, setTherapistLocked] = useState(pkg?.therapist_locked ?? true);
  const [minGapHours, setMinGapHours] = useState(pkg?.min_gap_hours ? String(pkg.min_gap_hours) : "");
  const [maxSessionsPerWeek, setMaxSessionsPerWeek] = useState(
    pkg?.max_sessions_per_week ? String(pkg.max_sessions_per_week) : ""
  );
  const [maxPurchasesPerPatient, setMaxPurchasesPerPatient] = useState(
    pkg?.max_purchases_per_patient ? String(pkg.max_purchases_per_patient) : ""
  );

  const [visibleOnHome, setVisibleOnHome] = useState(pkg?.visible_on_home ?? true);
  const [visibleOnConditions, setVisibleOnConditions] = useState(pkg?.visible_on_conditions ?? true);
  const [visibleInDashboard, setVisibleInDashboard] = useState(pkg?.visible_in_dashboard ?? true);
  const [active, setActive] = useState(pkg?.active ?? true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const category = categories.find((c) => c.id === categoryId);
  const savings = computePackageSavings({
    sessionCount: Number(sessionCount) || 1,
    pricePaise: Math.round((Number(priceInr) || 0) * 100),
    compareAtPaise: compareAtInr ? Math.round(Number(compareAtInr) * 100) : null,
    categoryPricePaise: category?.price_paise ?? null,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const promises = promisesText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    const body = {
      ...(isEdit ? { id: pkg!.id } : { categoryId }),
      title,
      subtitle: subtitle || null,
      description: description || null,
      imageUrl: imageUrl || null,
      promises,
      badgeLabel: badgeLabel || null,
      highlight,
      terms: terms || null,
      sessionCount,
      priceInr,
      compareAtInr: compareAtInr || null,
      displayOrder,
      therapistRateBasis,
      validityDays: validityDays || null,
      sessionDurationMinutes: sessionDurationMinutes || null,
      therapistLocked,
      minGapHours: minGapHours || null,
      maxSessionsPerWeek: maxSessionsPerWeek || null,
      maxPurchasesPerPatient: maxPurchasesPerPatient || null,
      visibleOnHome,
      visibleOnConditions,
      visibleInDashboard,
      active,
    };

    const res = await fetch(isEdit ? "/api/admin/update-package" : "/api/admin/create-package", {
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
    onCancel?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-5 text-xs">
      {error && <p className="text-red-600">{error}</p>}

      {isEdit && pkg?.package_code && (
        <p className="text-slate-400">
          Package Code: <span className="font-mono text-slate-600">{pkg.package_code}</span> (permanent, quoted in
          support conversations)
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="font-bold text-slate-700 mb-1">Identity</legend>
        {!isEdit && (
          <Field label="Category" hint="Fixes the session type, duration, and list price. Cannot be changed after creation.">
            <select value={categoryId} disabled className="w-full p-2 rounded-lg border border-slate-300 bg-slate-100">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        {isEdit && (
          <Field label="Category" hint="Set once at creation and locked afterward — live purchases reference it.">
            <p className="p-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
              {categories.find((c) => c.id === pkg!.category_id)?.title ?? "Unknown category"}
            </p>
          </Field>
        )}
        <Field label="Package Name" hint="The headline on the card.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spine Rehabilitation Programme" required className={inputCls()} />
        </Field>
        <Field label="Subtitle" hint="One line under the name.">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. 12 weeks, one therapist, measured progress" className={inputCls()} />
        </Field>
        <Field label="Description" hint="The paragraph a patient reads before buying.">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls()} />
        </Field>
        <Field label="Cover Image URL" hint="Recommend 16:9, at least 1200px wide.">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={inputCls()} />
        </Field>
        <Field label="What We Promise" hint="One per line. Becomes a ticked list on the card. 3–5 is the sweet spot.">
          <textarea value={promisesText} onChange={(e) => setPromisesText(e.target.value)} rows={4} placeholder={"Weekly 1-on-1 sessions\nSame therapist throughout\nProgress reviewed every 4 sessions"} className={inputCls()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Badge" hint="Corner ribbon text. Blank = none.">
            <input value={badgeLabel} onChange={(e) => setBadgeLabel(e.target.value)} placeholder="Most chosen" className={inputCls()} />
          </Field>
          <label className="flex items-center gap-2 font-semibold pt-6">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="w-4 h-4 accent-teal-600" />
            Feature this package
          </label>
        </div>
        <Field label="Terms" hint="Fine print shown at checkout and on the receipt.">
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className={inputCls()} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-bold text-slate-700 mb-1">Commercial</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sessions Included" hint="Editing this later never changes packages already sold.">
            <input type="number" min={2} step="1" value={sessionCount} onChange={(e) => setSessionCount(e.target.value)} required className={inputCls()} />
          </Field>
          <Field label="Bundle Price (₹)" hint="What the patient pays, once, upfront.">
            <input type="number" min={1} step="0.01" value={priceInr} onChange={(e) => setPriceInr(e.target.value)} required className={inputCls()} />
          </Field>
        </div>
        <Field label="Compare-at Price (₹)" hint="The struck-through 'was' price. Leave blank to compute automatically from the category's per-session price — recommended, so the saving can never contradict real pricing.">
          <input type="number" min={1} step="0.01" value={compareAtInr} onChange={(e) => setCompareAtInr(e.target.value)} placeholder="Auto" className={inputCls()} />
        </Field>
        {savings.compareAtPaise !== null && (
          <p className="text-teal-700 font-semibold">
            ₹{savings.perSessionPaise / 100} / session · Patient saves ₹{(savings.savingsPaise ?? 0) / 100} (
            {savings.savingsPercent}%) vs ₹{savings.compareAtPaise / 100}
          </p>
        )}
        <Field label="Therapist Pay Basis" hint="Whether the therapist's revenue share is calculated on the discounted per-session amount, or on the category's full list price (the business absorbs the discount).">
          <select value={therapistRateBasis} onChange={(e) => setTherapistRateBasis(e.target.value as "package_actual" | "category_list")} className={inputCls()}>
            <option value="package_actual">Discounted package price</option>
            <option value="category_list">Category list price</option>
          </select>
        </Field>
        <Field label="Display Order" hint="Sort position wherever packages are listed. Lower first.">
          <input type="number" step="1" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} required className={inputCls()} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-bold text-slate-700 mb-1">Rules</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Validity (days)" hint="Blank uses the global default in Package Settings.">
            <input type="number" min={1} step="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} placeholder="Default" className={inputCls()} />
          </Field>
          <Field label="Session Duration (min)" hint="Blank inherits the category's duration.">
            <input type="number" min={1} step="1" value={sessionDurationMinutes} onChange={(e) => setSessionDurationMinutes(e.target.value)} placeholder="Category default" className={inputCls()} />
          </Field>
        </div>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={therapistLocked} onChange={(e) => setTherapistLocked(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          Lock to one therapist for the whole programme
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum gap between sessions (hours)" hint="Blank = no limit.">
            <input type="number" min={1} step="1" value={minGapHours} onChange={(e) => setMinGapHours(e.target.value)} className={inputCls()} />
          </Field>
          <Field label="Maximum sessions per week" hint="Blank = no limit.">
            <input type="number" min={1} step="1" value={maxSessionsPerWeek} onChange={(e) => setMaxSessionsPerWeek(e.target.value)} className={inputCls()} />
          </Field>
        </div>
        <Field label="Maximum purchases per patient" hint="Blank = unlimited.">
          <input type="number" min={1} step="1" value={maxPurchasesPerPatient} onChange={(e) => setMaxPurchasesPerPatient(e.target.value)} className={inputCls()} />
        </Field>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-bold text-slate-700 mb-1">Placement &amp; Status</legend>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={visibleOnHome} onChange={(e) => setVisibleOnHome(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          Show on Home page
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={visibleOnConditions} onChange={(e) => setVisibleOnConditions(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          Show on Conditions page
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={visibleInDashboard} onChange={(e) => setVisibleInDashboard(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          Show in Patient Dashboard
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-teal-600" />
          Active (master switch — off hides it everywhere and blocks purchase; existing purchases are unaffected)
        </label>
      </fieldset>

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-2 rounded-lg transition">
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading} className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition">
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Package"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-semibold mb-1">{label}</label>
      {children}
      {hint && <p className="text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
