"use client";

// The two things an admin does to a single home visit -- fix the address it
// is being delivered to, and put a therapist on it. They used to live inside
// a Home Visit-only queue screen; the queue itself is gone (a home visit is
// a delivery mode, not a parallel booking system -- see AGENTS.md), so its
// rows are now part of the one All Sessions list and these two forms are
// rendered from the shared session drawer instead.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";


export type HomeVisitRow = {
  id: string;
  session_code: string | null;
  slot_time: string | null;
  timezone: string | null;
  concern: string | null;
  status: string;
  duration_minutes: number | null;
  patient_id: string;
  therapist_id: string | null;
  payment_status: string;
  amount_paid_paise: number | null;
  travel_fee_paise: number | null;
  no_show: boolean;
  visit_address_line1: string | null;
  visit_address_line2: string | null;
  visit_landmark: string | null;
  visit_city: string | null;
  visit_state: string | null;
  visit_pincode: string | null;
  visit_latitude: number | null;
  visit_longitude: number | null;
  visit_contact_phone: string | null;
  visit_access_notes: string | null;
  cash_collected_at: string | null;
  // Read by HomeVisitCashLedger, not by this component -- carried on the
  // same row rather than a second fetch, since AdminHomeVisitsTab already
  // has this exact query loaded for the queue above.
  cash_collected_amount_paise: number | null;
  cash_remitted_at: string | null;
  payment_method: string | null;
  home_visit_purchase_id: string | null;
  refund_status: string | null;
  refund_amount_paise: number | null;
  patientName: string;
  patientCode: string | null;
  therapistName: string | null;
};

function inputCls() {
  return "w-full p-2 rounded-lg border border-slate-300 text-xs";
}

export function HomeVisitAddressEditor({
  visit,
  onDone,
}: {
  visit: HomeVisitRow;
  onDone: () => void;
}) {
  const [line1, setLine1] = useState(visit.visit_address_line1 ?? "");
  const [line2, setLine2] = useState(visit.visit_address_line2 ?? "");
  const [landmark, setLandmark] = useState(visit.visit_landmark ?? "");
  const [city, setCity] = useState(visit.visit_city ?? "");
  const [state, setState] = useState(visit.visit_state ?? "");
  const [pincode, setPincode] = useState(visit.visit_pincode ?? "");
  const [contactPhone, setContactPhone] = useState(visit.visit_contact_phone ?? "");
  const [accessNotes, setAccessNotes] = useState(visit.visit_access_notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/update-home-visit-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: visit.id,
          line1,
          line2: line2 || null,
          landmark: landmark || null,
          city: city || null,
          state: state || null,
          pincode,
          contactPhone: contactPhone || null,
          accessNotes: accessNotes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save. Please try again.");
        return;
      }
      // Saved either way -- an admin correcting an address is making a
      // deliberate call, so an out-of-area pincode is a warning, not a
      // rejection. Say so rather than letting it pass silently.
      if (data.serviceable === false) {
        setWarning("Saved, but that pincode isn't a service area — no travel fee applies.");
        router.refresh();
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input value={line1} onChange={(e) => setLine1(e.target.value)} className={inputCls()} placeholder="Flat / house and street" />
      <input value={line2} onChange={(e) => setLine2(e.target.value)} className={inputCls()} placeholder="Area / locality" />
      <input value={landmark} onChange={(e) => setLandmark(e.target.value)} className={inputCls()} placeholder="Landmark" />
      <div className="grid grid-cols-3 gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls()} placeholder="City" />
        <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls()} placeholder="State" />
        <input value={pincode} onChange={(e) => setPincode(e.target.value)} className={inputCls()} placeholder="Pincode" />
      </div>
      <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls()} placeholder="Phone to call on arrival" />
      <textarea value={accessNotes} onChange={(e) => setAccessNotes(e.target.value)} rows={2} className={inputCls()} placeholder="Access notes" />
      <p className="text-[10px] text-slate-400">
        Editing here changes this visit only — the patient&apos;s saved address is untouched.
        Any map pin is cleared, since it belonged to the old address.
      </p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {warning && <p className="text-[11px] text-amber-700">{warning}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
        >
          Save address
        </button>
        <button onClick={onDone} className="text-[11px] text-slate-500 hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function HomeVisitAssignForm({
  visit,
  therapists,
}: {
  visit: HomeVisitRow;
  therapists: { id: string; full_name: string }[];
}) {
  const [therapistId, setTherapistId] = useState(visit.therapist_id ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleAssign() {
    if (!therapistId) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/assign-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: visit.id, therapistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
      } else {
        setError(data.error ?? "Could not assign. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={therapistId}
          onChange={(e) => setTherapistId(e.target.value)}
          className="rounded-lg border border-slate-300 p-2 text-xs"
        >
          <option value="">Choose a therapist…</option>
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={isPending || !therapistId}
          className="rounded-lg bg-slate-800 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
        >
          {visit.therapist_id ? "Reassign" : "Assign"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
