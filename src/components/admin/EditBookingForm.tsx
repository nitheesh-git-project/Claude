"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function minDateTimeLocal() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toDateTimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function EditBookingForm({
  appointmentId,
  currentTherapistId,
  currentSlotTime,
  currentCategoryId,
  therapists,
  categories,
  onSaved,
}: {
  appointmentId: string;
  currentTherapistId: string | null;
  currentSlotTime: string | null;
  currentCategoryId?: string | null;
  therapists: { id: string; full_name: string }[];
  categories?: { id: string; title: string; active?: boolean }[];
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [therapistId, setTherapistId] = useState(
    currentTherapistId ?? therapists[0]?.id ?? ""
  );
  const [slotDateTime, setSlotDateTime] = useState(
    currentSlotTime ? toDateTimeLocalValue(currentSlotTime) : ""
  );
  const [categoryId, setCategoryId] = useState(currentCategoryId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!therapistId || !slotDateTime) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/update-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId,
        therapistId,
        slotDateTime: new Date(slotDateTime).toISOString(),
        categoryId: categoryId || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }
    setOpen(false);
    router.refresh();
    // Lets a parent (e.g. the session detail drawer) close itself or clear
    // its own snapshot of this appointment instead of continuing to show
    // stale pre-reassignment data after router.refresh() re-renders behind
    // it — refresh() alone doesn't reconcile client-side state that was
    // captured at click-time.
    onSaved?.();
  }

  if (therapists.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-teal-700 font-semibold hover:underline"
      >
        Reschedule / Reassign
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 mt-1"
    >
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={therapistId}
          onChange={(e) => setTherapistId(e.target.value)}
          className="p-2 rounded-lg border border-slate-300 bg-white"
        >
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={slotDateTime}
          min={minDateTimeLocal()}
          onChange={(e) => setSlotDateTime(e.target.value)}
          required
          className="p-2 rounded-lg border border-slate-300"
        />
        {categories && categories.length > 0 && (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 bg-white"
          >
            <option value="">Category unchanged</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.active === false ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-lg transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold px-3 py-1.5 rounded-lg transition"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
