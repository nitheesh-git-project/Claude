"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import CatalogImageField from "@/components/admin/CatalogImageField";
import { FOCAL_DEFAULT } from "@/lib/catalogImage";

type Category = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  /** Where the subject of the cover sits. Migration-dependent like
   *  `specialty`, so optional: a database one apply behind hands through
   *  undefined and the picture centres, exactly as it did before. */
  image_focal_x?: number | null;
  image_focal_y?: number | null;
  points: string[];
  price_paise: number;
  duration_minutes: number;
  cta_label: string;
  display_order: number;
  active: boolean;
  featured?: boolean | null;
  /** Which of the three condition types this belongs to. Migration-dependent
   *  and optional on the type, so a caller reading it from a database
   *  without the column hands through undefined rather than failing. */
  specialty?: string | null;
};

type NewCategoryValues = Omit<Category, "id">;

export default function TreatmentCategoryForm({
  category,
  initialValues,
  nextDisplayOrder,
  onCancel,
}: {
  category?: Category;
  /** Prefills a new (non-edit) form, e.g. when duplicating an existing category. */
  initialValues?: NewCategoryValues;
  /**
   * Where a brand-new category lands: one past the last existing one, so it
   * appends. It defaulted to 0, which put every new condition at the top of
   * the list AND gave every one of them the same order -- and equal orders
   * are what made the old pairwise reorder a silent no-op. The list save
   * renumbers 1..n, so this only has to be right at the moment of creation.
   */
  nextDisplayOrder?: number;
  onCancel?: () => void;
}) {
  const isEdit = !!category;
  const defaults = category ?? initialValues;
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const [imageUrl, setImageUrl] = useState(defaults?.image_url ?? "");
  const [focalX, setFocalX] = useState(defaults?.image_focal_x ?? FOCAL_DEFAULT);
  const [focalY, setFocalY] = useState(defaults?.image_focal_y ?? FOCAL_DEFAULT);
  // A row being created has no id yet, so the upload is keyed on a draft one.
  // It only ever names a storage path, and the row stores the URL the upload
  // returns -- so a draft that is never saved leaves one orphaned object and
  // no bad data.
  const [draftId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `draft-${Date.now()}`
  );
  const [pointsText, setPointsText] = useState((defaults?.points ?? []).join("\n"));
  const [priceInr, setPriceInr] = useState(
    defaults ? String(defaults.price_paise / 100) : ""
  );
  const [durationMinutes, setDurationMinutes] = useState(
    defaults ? String(defaults.duration_minutes) : "60"
  );
  const [ctaLabel, setCtaLabel] = useState(defaults?.cta_label ?? "Book Assessment");
  const [specialty, setSpecialty] = useState(defaults?.specialty ?? "");
  const newOrderDefault = String(nextDisplayOrder ?? 0);
  const [displayOrder, setDisplayOrder] = useState(
    defaults ? String(defaults.display_order) : newOrderDefault
  );
  const [active, setActive] = useState(defaults?.active ?? true);
  const [featured, setFeatured] = useState(defaults?.featured === true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const points = pointsText
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    const body = {
      ...(isEdit ? { id: category!.id } : {}),
      title,
      description,
      imageUrl,
      imageFocalX: focalX,
      imageFocalY: focalY,
      points,
      priceInr,
      durationMinutes,
      ctaLabel,
      specialty: specialty || null,
      displayOrder,
      active,
      featured,
    };

    const res = await fetch(
      isEdit
        ? "/api/admin/update-treatment-category"
        : "/api/admin/create-treatment-category",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    if (!isEdit) {
      setTitle("");
      setDescription("");
      setImageUrl("");
      setPointsText("");
      setPriceInr("");
      setDurationMinutes("60");
      setCtaLabel("Book Assessment");
      setDisplayOrder(newOrderDefault);
    }
    onCancel?.();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
    >
      {error && <p className="text-red-600">{error}</p>}
      <label className="block">
        <span className="block font-semibold mb-1">Category Name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </label>
      <label className="block">
        <span className="block font-semibold mb-1">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </label>
      <div>
        <CatalogImageField
          kind="category"
          rowId={category?.id ?? draftId}
          value={imageUrl || null}
          focalX={focalX}
          focalY={focalY}
          onChange={(next) => {
            setImageUrl(next.url ?? "");
            setFocalX(next.focalX);
            setFocalY(next.focalY);
          }}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Shown on the card on the home page and Conditions, and at the top of
          this condition&apos;s detail dialog. Landscape works best. Left
          blank, the card falls back to its illustration.
        </p>
      </div>
      <label className="block">
        <span className="block font-semibold mb-1">
          Tick Points{" "}
          <span className="font-normal text-slate-400">(one per line)</span>
        </span>
        <textarea
          value={pointsText}
          onChange={(e) => setPointsText(e.target.value)}
          rows={4}
          className="w-full p-2 rounded-lg border border-slate-300"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-semibold mb-1">Price (₹)</span>
          <input
            type="number"
            min={1}
            step="0.01"
            value={priceInr}
            onChange={(e) => setPriceInr(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">Session Length (min)</span>
          <input
            type="number"
            min={1}
            step="1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block font-semibold mb-1">Order</span>
          <input
            type="number"
            step="1"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            required
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </label>
        <label className="block">
          <span className="block font-semibold mb-1">Button Text</span>
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Book Assessment"
            className="w-full p-2 rounded-lg border border-slate-300"
          />
        </label>
      </div>
      {/* Nothing a patient sees. It groups this condition in the picker a
          therapist uses to recommend treatment, so a clinician chooses a
          condition type and a number of sessions rather than reading a list
          of programme names. Leaving it unset is allowed and costs only the
          grouping. */}
      <div>
        <label htmlFor="category-specialty" className="block font-semibold mb-1">
          Condition type
        </label>
        <select
          id="category-specialty"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="w-full p-2 rounded-lg border border-slate-300"
        >
          <option value="">Not set</option>
          <option value="ortho">Orthopaedic</option>
          <option value="neuro">Neurological</option>
          <option value="pediatrics">Paediatric</option>
        </select>
        <p className="text-[11px] text-slate-500 mt-1">
          Groups this condition in the therapist&apos;s recommendation picker. Patients never
          see it.
        </p>
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 accent-teal-600"
        />
        Active (visible to patients)
      </label>
      <label className="flex items-start gap-2 font-semibold">
        <input
          type="checkbox"
          checked={featured}
          onChange={(e) => setFeatured(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-teal-600"
        />
        <span>
          Feature on the home page
          <span className="block text-[11px] font-normal text-slate-500">
            The home page leads with four conditions and links to the full list. Tick
            the ones you sell most. With none ticked it shows the first four in this
            order, so the page is never empty.
          </span>
        </span>
      </label>
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-2 rounded-lg transition"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-lg transition"
        >
          {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Category"}
        </button>
      </div>
    </form>
  );
}
