"use client";

import { useState, useTransition } from "react";
import AdminSlotPicker, { earliestSlot, slotToMs } from "@/components/admin/AdminSlotPicker";
import { leadTimeMsFromHours } from "@/lib/bookingSlots";
import { useRouter } from "next/navigation";
import { useUnloadWarning } from "@/lib/useUnloadWarning";

// Booking on someone's behalf -- the phone call the dashboard could not
// answer before this. Every field here is a decision only the person on the
// call can make; nothing is guessed, and the price shown is the category's
// own, never an editable number the browser could send back.

type Person = { id: string; full_name: string | null; email?: string | null };
type Category = { id: string; title: string; price_paise: number; duration_minutes: number; active?: boolean };

export default function AdminNewBookingTab({
  patients,
  therapists,
  categories,
  leadTimeHours,
}: {
  patients: Person[];
  therapists: { id: string; full_name: string }[];
  categories: Category[];
  leadTimeHours: number;
}) {
  const [patientId, setPatientId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  // One instant for the form, read once on mount, so the picker offers dates
  // against the same clock the submit check uses.
  const [nowMs] = useState(() => Date.now());
  const [slot, setSlot] = useState(() => earliestSlot(Date.now(), leadTimeMsFromHours(leadTimeHours)));
  const [notes, setNotes] = useState("");
  const [paymentMode, setPaymentMode] = useState<"unpaid" | "paid_offline">("unpaid");
  const [overrideLeadTime, setOverrideLeadTime] = useState(false);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useUnloadWarning(isPending);

  const bookableCategories = categories.filter((c) => c.active !== false);
  const selectedCategory = bookableCategories.find((c) => c.id === categoryId) ?? null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    setSuccess(null);

    const slotMs = slotToMs(slot.dateKey, slot.hour);
    if (!patientId || !categoryId || slotMs === null) {
      setError("Patient, category, date and time are all required.");
      return;
    }

    // Built as a local wall-clock time and sent as an ISO instant -- the
    // clinic works in IST and the admin is typing IST, so the browser's own
    // timezone doing the conversion is the correct behaviour here.
    const slotTime = new Date(slotMs).toISOString();

    startTransition(async () => {
      const res = await fetch("/api/admin/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          patientId,
          categoryId,
          therapistId: therapistId || null,
          slotTime,
          timezone: "Asia/Kolkata",
          notes: notes.trim() || null,
          paymentMode,
          overrideLeadTime,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create the booking.");
        setNeedsOverride(!!data.needsLeadTimeOverride);
        return;
      }
      setSuccess(
        data.status === "confirmed"
          ? "Booked and confirmed. The calendar invite is on its way."
          : "Booked. It's in the queue waiting for a therapist."
      );
      setNeedsOverride(false);
      setOverrideLeadTime(false);
      setNotes("");
      setSlot(earliestSlot(Date.now(), leadTimeMsFromHours(leadTimeHours)));
      router.refresh();
    });
  }

  const fieldCls = "w-full p-2 rounded-lg border border-slate-300 text-xs";
  const labelCls = "block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl">
      <h2 className="font-display font-bold text-lg text-slate-800">New Booking</h2>
      <p className="text-xs text-slate-500 mt-1 mb-5">
        For a patient who called instead of booking online. Assign a therapist now and it is
        confirmed immediately; leave it unassigned and it joins the normal queue.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="booking-patient">
            Patient
          </label>
          <select
            id="booking-patient"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className={fieldCls}
          >
            <option value="">Choose a patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? "Unnamed"}
                {p.email ? ` · ${p.email}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="booking-category">
            Treatment
          </label>
          <select
            id="booking-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={fieldCls}
          >
            <option value="">Choose a treatment…</option>
            {bookableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · ₹{(c.price_paise / 100).toLocaleString("en-IN")} ·{" "}
                {c.duration_minutes} min
              </option>
            ))}
          </select>
        </div>

        {/* The patient's own calendar and hour cells rather than a pair of
            native inputs, so an admin booking on the phone sees exactly what
            the caller would see on the website. Ticking the override below
            drops the lead time to zero and the grid opens up with it --
            that is the one thing this screen may do that /book may not. */}
        <AdminSlotPicker
          startOpen
          label="Date & time"
          dateKey={slot.dateKey}
          hour={slot.hour}
          onChange={setSlot}
          nowMs={nowMs}
          leadTimeMs={overrideLeadTime ? 0 : leadTimeMsFromHours(leadTimeHours)}
        />

        <div>
          <label className={labelCls} htmlFor="booking-therapist">
            Therapist
          </label>
          <select
            id="booking-therapist"
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value)}
            className={fieldCls}
          >
            <option value="">Leave unassigned (goes to the queue)</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            A clash with the therapist&apos;s existing sessions is refused — the same check a
            patient&apos;s own booking goes through.
          </p>
        </div>

        <div>
          <span className={labelCls}>Payment</span>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="radio"
                name="paymentMode"
                checked={paymentMode === "unpaid"}
                onChange={() => setPaymentMode("unpaid")}
                className="mt-0.5"
              />
              <span>
                <strong>Unpaid</strong> — the patient still owes for this session.
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="radio"
                name="paymentMode"
                checked={paymentMode === "paid_offline"}
                onChange={() => setPaymentMode("paid_offline")}
                className="mt-0.5"
              />
              <span>
                <strong>Already paid offline</strong> — records{" "}
                {selectedCategory
                  ? `₹${(selectedCategory.price_paise / 100).toLocaleString("en-IN")}`
                  : "the category price"}{" "}
                as collected. There is no Razorpay payment behind it, so no automatic refund is
                possible later.
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="booking-notes">
            Notes
          </label>
          <textarea
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={fieldCls}
            placeholder="Anything the therapist should know before the session"
          />
        </div>

        {needsOverride && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={overrideLeadTime}
              onChange={(e) => setOverrideLeadTime(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Book inside the {leadTimeHours}-hour window anyway. The website refuses this on
              purpose; doing it here is recorded in the activity log.
            </span>
          </label>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800">
            {success}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {isPending ? "Booking…" : "Create booking"}
          </button>
          <p className="text-[11px] text-slate-400">
            Home visits need an address and a serviceable pincode — book those from the
            patient&apos;s own flow for now.
          </p>
        </div>
      </form>
    </div>
  );
}
