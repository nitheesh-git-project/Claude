"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { computeHomeVisitSavings } from "@/lib/homeVisitProgress";

export type HomeVisitPackage = {
  id: string;
  package_code: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  benefits: string[];
  badge_label: string | null;
  highlight: boolean;
  terms: string | null;
  visit_count: number;
  price_paise: number;
  compare_at_paise: number | null;
  visit_duration_minutes: number;
  validity_days: number | null;
  travel_fee_included: boolean;
  therapist_locked: boolean;
  min_gap_hours: number | null;
  max_visits_per_week: number | null;
  max_purchases_per_patient: number | null;
  category_id: string | null;
  display_order: number;
  visible_on_home: boolean;
  visible_on_home_visit_page: boolean;
  visible_in_dashboard: boolean;
  active: boolean;
};

function inputCls() {
  return "w-full p-2 rounded-lg border border-slate-300 text-xs";
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
        {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

export default function HomeVisitPackageForm({
  pkg,
  categories,
  onCancel,
}: {
  pkg?: HomeVisitPackage;
  categories: { id: string; title: string }[];
  onCancel?: () => void;
}) {
  const isEdit = !!pkg;

  const [title, setTitle] = useState(pkg?.title ?? "");
  const [subtitle, setSubtitle] = useState(pkg?.subtitle ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [imageUrl, setImageUrl] = useState(pkg?.image_url ?? "");
  const [benefitsText, setBenefitsText] = useState((pkg?.benefits ?? []).join("\n"));
  const [badgeLabel, setBadgeLabel] = useState(pkg?.badge_label ?? "");
  const [highlight, setHighlight] = useState(pkg?.highlight ?? false);
  const [terms, setTerms] = useState(pkg?.terms ?? "");

  const [visitCount, setVisitCount] = useState(pkg ? String(pkg.visit_count) : "1");
  const [priceInr, setPriceInr] = useState(pkg ? String(pkg.price_paise / 100) : "");
  const [compareAtInr, setCompareAtInr] = useState(
    pkg?.compare_at_paise ? String(pkg.compare_at_paise / 100) : ""
  );
  const [visitDurationMinutes, setVisitDurationMinutes] = useState(
    pkg ? String(pkg.visit_duration_minutes) : "60"
  );
  const [validityDays, setValidityDays] = useState(pkg?.validity_days ? String(pkg.validity_days) : "");
  const [travelFeeIncluded, setTravelFeeIncluded] = useState(pkg?.travel_fee_included ?? false);
  const [therapistLocked, setTherapistLocked] = useState(pkg?.therapist_locked ?? true);
  const [minGapHours, setMinGapHours] = useState(pkg?.min_gap_hours ? String(pkg.min_gap_hours) : "");
  const [maxVisitsPerWeek, setMaxVisitsPerWeek] = useState(
    pkg?.max_visits_per_week ? String(pkg.max_visits_per_week) : ""
  );
  const [maxPurchasesPerPatient, setMaxPurchasesPerPatient] = useState(
    pkg?.max_purchases_per_patient ? String(pkg.max_purchases_per_patient) : ""
  );
  const [categoryId, setCategoryId] = useState(pkg?.category_id ?? "");
  const [displayOrder, setDisplayOrder] = useState(pkg ? String(pkg.display_order) : "0");

  const [visibleOnHome, setVisibleOnHome] = useState(pkg?.visible_on_home ?? false);
  const [visibleOnHomeVisitPage, setVisibleOnHomeVisitPage] = useState(
    pkg?.visible_on_home_visit_page ?? true
  );
  const [visibleInDashboard, setVisibleInDashboard] = useState(pkg?.visible_in_dashboard ?? true);
  const [active, setActive] = useState(pkg?.active ?? true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const count = Number(visitCount) || 1;
  const savings = computeHomeVisitSavings({
    visitCount: count,
    pricePaise: Math.round((Number(priceInr) || 0) * 100),
    compareAtPaise: compareAtInr ? Math.round(Number(compareAtInr) * 100) : null,
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const benefits = benefitsText
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean);

    const body = {
      ...(isEdit ? { id: pkg!.id } : {}),
      title,
      subtitle: subtitle || null,
      description: description || null,
      imageUrl: imageUrl || null,
      benefits,
      badgeLabel: badgeLabel || null,
      highlight,
      terms: terms || null,
      visitCount,
      priceInr,
      compareAtInr: compareAtInr || null,
      visitDurationMinutes,
      validityDays: validityDays || null,
      travelFeeIncluded,
      therapistLocked,
      minGapHours: minGapHours || null,
      maxVisitsPerWeek: maxVisitsPerWeek || null,
      maxPurchasesPerPatient: maxPurchasesPerPatient || null,
      categoryId: categoryId || null,
      displayOrder,
      visibleOnHome,
      visibleOnHomeVisitPage,
      visibleInDashboard,
      active,
    };

    const res = await fetch(
      isEdit ? "/api/admin/update-home-visit-package" : "/api/admin/create-home-visit-package",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      router.refresh();
      onCancel?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save. Please try again.");
    }
    setLoading(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-4"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Package Name">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls()} />
        </Field>
        <Field label="Subtitle" hint="One short line under the name on the card.">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputCls()} />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputCls()}
        />
      </Field>

      <Field label="Benefits" hint="One per line. These are the bullets on the public card.">
        <textarea
          value={benefitsText}
          onChange={(e) => setBenefitsText(e.target.value)}
          rows={4}
          className={inputCls()}
          placeholder={"Therapist comes to you\nNo travel, no waiting room\nSame recovery plan as in clinic"}
        />
      </Field>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field
          label="Visits Included"
          hint="Set 1 to sell a single one-off home visit — there is no separate single-visit product."
        >
          <input
            type="number"
            min={1}
            value={visitCount}
            onChange={(e) => setVisitCount(e.target.value)}
            required
            className={inputCls()}
          />
        </Field>
        <Field label="Package Price (₹)" hint="Total for all visits, before travel.">
          <input
            type="number"
            min={1}
            step="0.01"
            value={priceInr}
            onChange={(e) => setPriceInr(e.target.value)}
            required
            className={inputCls()}
          />
        </Field>
        <Field label="Compare-at Price (₹)" hint="Optional strike-through price.">
          <input
            type="number"
            min={0}
            step="0.01"
            value={compareAtInr}
            onChange={(e) => setCompareAtInr(e.target.value)}
            className={inputCls()}
          />
        </Field>
      </div>

      <p className="text-[11px] text-slate-600 bg-white rounded-lg border border-slate-200 p-2">
        ₹{(savings.perVisitPaise / 100).toLocaleString("en-IN")} per visit
        {savings.savingsPercent !== null && (
          <span className="text-teal-700 font-semibold"> · Save {savings.savingsPercent}%</span>
        )}
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Visit Duration (minutes)">
          <input
            type="number"
            min={1}
            value={visitDurationMinutes}
            onChange={(e) => setVisitDurationMinutes(e.target.value)}
            required
            className={inputCls()}
          />
        </Field>
        <Field label="Validity (days)" hint="Blank means no expiry.">
          <input
            type="number"
            min={1}
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="Order" hint="Lower shows first.">
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            className={inputCls()}
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Minimum gap between visits (hours)" hint="Blank means no minimum.">
          <input
            type="number"
            min={1}
            value={minGapHours}
            onChange={(e) => setMinGapHours(e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="Maximum visits per week" hint="Blank means no cap.">
          <input
            type="number"
            min={1}
            value={maxVisitsPerWeek}
            onChange={(e) => setMaxVisitsPerWeek(e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="Maximum purchases per patient" hint="Blank means no cap.">
          <input
            type="number"
            min={1}
            value={maxPurchasesPerPatient}
            onChange={(e) => setMaxPurchasesPerPatient(e.target.value)}
            className={inputCls()}
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Condition Category" hint="Optional grouping only.">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls()}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Badge text" hint="e.g. Most popular.">
          <input value={badgeLabel} onChange={(e) => setBadgeLabel(e.target.value)} className={inputCls()} />
        </Field>
        <Field label="Cover image URL">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputCls()} />
        </Field>
      </div>

      <Field label="Terms">
        <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className={inputCls()} />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
        <Check
          checked={travelFeeIncluded}
          onChange={setTravelFeeIncluded}
          label="Travel fee included in price"
          hint="On: the price above is all the patient pays, and the area's travel fee is not added at checkout. The therapist is still paid that fee either way — this only changes what the patient is quoted."
        />
        <Check
          checked={therapistLocked}
          onChange={setTherapistLocked}
          label="Lock to one therapist"
          hint="Every visit in the programme goes to whoever takes the first one."
        />
        <Check checked={highlight} onChange={setHighlight} label="Feature this package" />
        <Check checked={active} onChange={setActive} label="Active" hint="Off hides it everywhere." />
        <Check
          checked={visibleOnHomeVisitPage}
          onChange={setVisibleOnHomeVisitPage}
          label="Show on the Home Visit page"
        />
        <Check checked={visibleOnHome} onChange={setVisibleOnHome} label="Show on the home page" />
        <Check
          checked={visibleInDashboard}
          onChange={setVisibleInDashboard}
          label="Show in the patient dashboard"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition disabled:opacity-60"
        >
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Package"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
