"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatSlotTime } from "@/lib/formatSlotTime";
import {
  formatAddressBlock,
  mapsSearchUrl,
  visitAddressFromAppointment,
} from "@/lib/formatAddress";

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
  patientName: string;
  patientCode: string | null;
  therapistName: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

function inputCls() {
  return "w-full p-2 rounded-lg border border-slate-300 text-xs";
}

function AddressEditor({
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

function AssignForm({
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

export default function HomeVisitQueue({
  visits,
  therapists,
}: {
  visits: HomeVisitRow[];
  therapists: { id: string; full_name: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"unassigned" | "upcoming" | "all">("unassigned");

  const unassigned = visits.filter((v) => !v.therapist_id && v.status !== "cancelled");
  const upcoming = visits.filter(
    (v) => v.status !== "cancelled" && v.status !== "completed"
  );
  const shown =
    filter === "unassigned" ? unassigned : filter === "upcoming" ? upcoming : visits;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-sm text-slate-800">Visits</h3>
        <p className="mt-1 text-xs text-slate-500">
          Every home visit booked. Assign a therapist, and fix the address before anyone sets
          off.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            { key: "unassigned", label: `Needs a therapist (${unassigned.length})` },
            { key: "upcoming", label: `Open (${upcoming.length})` },
            { key: "all", label: `All (${visits.length})` },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              filter === f.key
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((v) => {
            const address = visitAddressFromAppointment(v);
            const lines = formatAddressBlock(address);
            const mapsUrl = mapsSearchUrl(address);
            return (
              <li key={v.id} className="space-y-2 rounded-xl border border-slate-200 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {v.patientName}
                      {v.patientCode && (
                        <span className="ml-2 font-mono text-[10px] font-normal text-slate-400">
                          {v.patientCode}
                        </span>
                      )}
                    </p>
                    <p className="text-slate-500">
                      <span className="font-mono">{v.session_code ?? "—"}</span>
                      {v.slot_time && ` · ${formatSlotTime(v.slot_time, v.timezone)}`}
                      {v.duration_minutes && ` · ${v.duration_minutes} min`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold capitalize ${
                        STATUS_STYLES[v.status] ?? "text-slate-600 bg-slate-100"
                      }`}
                    >
                      {v.no_show ? "No-Show" : v.status}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 font-semibold ${
                        v.payment_status === "paid"
                          ? "text-teal-700 bg-teal-50"
                          : "text-amber-700 bg-amber-50"
                      }`}
                    >
                      {v.payment_status === "paid"
                        ? "Paid"
                        : v.cash_collected_at
                          ? "Cash collected"
                          : "Cash on visit"}
                    </span>
                  </div>
                </div>

                <p className="text-slate-600">{v.concern ?? "Home Physiotherapy Visit"}</p>

                <div className="rounded-lg bg-slate-50 p-3">
                  {lines.length > 0 ? (
                    lines.map((line) => (
                      <p key={line} className="text-slate-700">
                        {line}
                      </p>
                    ))
                  ) : (
                    <p className="text-red-600">No address on this visit.</p>
                  )}
                  {v.visit_contact_phone && (
                    <p className="pt-1 text-slate-600">Call on arrival: {v.visit_contact_phone}</p>
                  )}
                  {v.visit_access_notes && (
                    <p className="pt-1 text-slate-600">
                      <span className="font-semibold text-slate-400">Getting in:</span>{" "}
                      {v.visit_access_notes}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-2">
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-teal-700 hover:underline"
                      >
                        Open in Maps
                      </a>
                    )}
                    <button
                      onClick={() => setEditingId(editingId === v.id ? null : v.id)}
                      className="text-[11px] font-semibold text-slate-600 hover:underline"
                    >
                      {editingId === v.id ? "Close" : "Edit address"}
                    </button>
                  </div>
                </div>

                {editingId === v.id && (
                  <AddressEditor visit={v} onDone={() => setEditingId(null)} />
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <p className="text-slate-500">
                    {v.therapist_id ? (
                      <>
                        Therapist:{" "}
                        <span className="font-semibold text-slate-700">
                          {v.therapistName ?? "Unknown"}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-amber-700">Not yet assigned</span>
                    )}
                    {v.travel_fee_paise !== null && v.travel_fee_paise > 0 && (
                      <span className="text-slate-400">
                        {" "}
                        · Travel ₹{(v.travel_fee_paise / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                  </p>
                  {v.status !== "cancelled" && v.status !== "completed" && (
                    <AssignForm visit={v} therapists={therapists} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
