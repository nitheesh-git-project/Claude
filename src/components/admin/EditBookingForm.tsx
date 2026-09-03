"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminSlotPicker, { slotFromIso, slotToMs } from "@/components/admin/AdminSlotPicker";

// Sentinel for the category <select>, distinct from both a real category id
// and the empty string (which means "leave the category unchanged"). Lets
// the admin explicitly clear a category instead of only ever being able to
// pick a different one.
const CLEAR_CATEGORY_VALUE = "__none__";

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
  therapists: { id: string; full_name: string; active?: boolean }[];
  categories?: { id: string; title: string; active?: boolean }[];
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [therapistId, setTherapistId] = useState(
    currentTherapistId ?? therapists[0]?.id ?? ""
  );
  // Read once on mount, so the grid and the submit check agree on "now".
  const [nowMs] = useState(() => Date.now());
  const [slot, setSlot] = useState(() => slotFromIso(currentSlotTime));
  const [categoryId, setCategoryId] = useState(currentCategoryId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const slotMs = slotToMs(slot.dateKey, slot.hour);
    if (!therapistId || slotMs === null) {
      setError("Pick a date and time for the session.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/update-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId,
        therapistId,
        slotDateTime: new Date(slotMs).toISOString(),
        categoryId:
          categoryId === "" ? undefined : categoryId === CLEAR_CATEGORY_VALUE ? null : categoryId,
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
        {/* A session nobody has been assigned to has not been "reassigned"
            or "rescheduled" -- naming it that way made the one action an
            admin most often needs read like an edit of something that
            already happened. */}
        {currentTherapistId ? "Reschedule / Reassign" : "Tap to assign & set the time"}
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
              {t.active === false ? " (suspended)" : ""}
            </option>
          ))}
        </select>
        {categories && categories.length > 0 && (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="p-2 rounded-lg border border-slate-300 bg-white"
          >
            <option value="">Category unchanged</option>
            <option value={CLEAR_CATEGORY_VALUE}>No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.active === false ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {/* Same calendar and hour cells as the patient's own booking screen, so
          one control means one thing everywhere. The lead time is zero here
          on purpose: this moves a session that already exists, which is the
          admin override lane rather than a booking — the same reasoning that
          exempts an admin from complete-session's gates. It still cannot
          reach into the past. */}
      <AdminSlotPicker
        startOpen
        label="Session date & time"
        dateKey={slot.dateKey}
        hour={slot.hour}
        onChange={setSlot}
        nowMs={nowMs}
        leadTimeMs={0}
      />
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
