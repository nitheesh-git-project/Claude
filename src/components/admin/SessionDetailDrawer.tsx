"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EditBookingForm from "@/components/admin/EditBookingForm";
import { formatSlotRange } from "@/lib/formatSlotRange";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES } from "@/lib/pricing";

export type SessionDetailAppointment = {
  id: string;
  slot_time: string | null;
  timezone: string | null;
  concern: string | null;
  status: string;
  payment_status: string;
  amount_paid_paise: number | null;
  duration_minutes: number | null;
  category_id: string | null;
  patient_id: string;
  therapist_id: string | null;
  notes: string | null;
  paid_at: string | null;
  patient_rating: number | null;
  patient_feedback: string | null;
  therapist_rating: number | null;
  therapist_feedback: string | null;
};

export type ReassignmentLogEntry = {
  id: string;
  appointment_id: string;
  changed_at: string;
  old_therapist_id: string | null;
  new_therapist_id: string | null;
  old_slot_time: string | null;
  new_slot_time: string | null;
  old_category_id: string | null;
  new_category_id: string | null;
};

type CategoryInfo = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes: number;
  active?: boolean;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500">
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function SessionDetailDrawer({
  appointment: a,
  peopleMap,
  categoryMap,
  therapists,
  categories,
  reassignmentLogs,
  onClose,
}: {
  appointment: SessionDetailAppointment;
  peopleMap: Map<string, string>;
  categoryMap: Map<string, CategoryInfo>;
  therapists: { id: string; full_name: string }[];
  categories: CategoryInfo[];
  reassignmentLogs: ReassignmentLogEntry[];
  onClose: () => void;
}) {
  const [reopening, setReopening] = useState(false);
  const [clearingRole, setClearingRole] = useState<"patient" | "therapist" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  const feePaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
  const durationMinutes = a.duration_minutes ?? BASE_DURATION_MINUTES;
  const canReassign = a.status === "requested" || a.status === "confirmed";
  const patientName = peopleMap.get(a.patient_id) ?? "Unknown";
  const therapistName = a.therapist_id ? peopleMap.get(a.therapist_id) ?? "Unknown" : null;
  const categoryTitle = a.category_id ? categoryMap.get(a.category_id)?.title ?? null : null;
  const history = reassignmentLogs
    .filter((l) => l.appointment_id === a.id)
    .sort((x, y) => new Date(y.changed_at).getTime() - new Date(x.changed_at).getTime());

  function nameOrUnassigned(id: string | null) {
    if (!id) return "Unassigned";
    return peopleMap.get(id) ?? "Unknown";
  }

  function categoryOrNone(id: string | null) {
    if (!id) return "No category";
    return categoryMap.get(id)?.title ?? "Unknown";
  }

  async function handleReopen() {
    if (
      !window.confirm(
        "Reopen this session? It goes back to Confirmed, reassignment unlocks again, and any ratings/feedback already submitted will be cleared."
      )
    ) {
      return;
    }
    setReopening(true);
    setActionError(null);
    const res = await fetch("/api/admin/reopen-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: a.id }),
    });
    const data = await res.json().catch(() => ({}));
    setReopening(false);
    if (!res.ok) {
      setActionError(data.error ?? "Could not reopen this session.");
      return;
    }
    router.refresh();
    onClose();
  }

  async function handleClearRating(role: "patient" | "therapist") {
    if (!window.confirm(`Clear the ${role}'s rating so they can submit it again?`)) return;
    setClearingRole(role);
    setActionError(null);
    const res = await fetch("/api/admin/clear-session-rating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: a.id, role }),
    });
    const data = await res.json().catch(() => ({}));
    setClearingRole(null);
    if (!res.ok) {
      setActionError(data.error ?? "Could not clear this rating.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 text-xs"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-slate-900">Session Details</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
              {actionError}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span
              className={`capitalize font-semibold px-2.5 py-1 rounded-full ${
                a.status === "completed"
                  ? "text-teal-700 bg-teal-50"
                  : a.status === "cancelled"
                  ? "text-red-700 bg-red-50"
                  : a.status === "confirmed"
                  ? "text-purple-700 bg-purple-50"
                  : "text-amber-700 bg-amber-50"
              }`}
            >
              {a.status}
            </span>
            <span
              className={`capitalize font-semibold px-2.5 py-1 rounded-full ${
                a.payment_status === "paid"
                  ? "text-green-700 bg-green-50"
                  : "text-slate-500 bg-slate-100"
              }`}
            >
              {a.payment_status}
            </span>
          </div>

          <div>
            <p className="text-slate-400">Patient</p>
            <Link
              href={`/admin/dashboard/patients/${a.patient_id}`}
              className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
            >
              {patientName}
            </Link>
          </div>

          <div>
            <p className="text-slate-400">Therapist</p>
            {a.therapist_id ? (
              <Link
                href={`/admin/dashboard/therapists/${a.therapist_id}`}
                className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
              >
                {therapistName ?? "Unknown"}
              </Link>
            ) : (
              <strong className="text-slate-900">Not yet assigned</strong>
            )}
          </div>

          <div>
            <p className="text-slate-400">Concern / Category</p>
            <p className="font-semibold text-slate-800">
              {a.concern ?? "General Consultation"}
              {categoryTitle && <span className="text-slate-500"> — {categoryTitle}</span>}
            </p>
          </div>

          <div>
            <p className="text-slate-400">Slot (IST)</p>
            <p className="font-semibold text-slate-800">
              {a.slot_time ? formatSlotRange(a.slot_time, durationMinutes) : "Time TBD"}
            </p>
          </div>

          <div>
            <p className="text-slate-400">Price</p>
            <p className="font-semibold text-slate-800">
              ₹{(feePaise / 100).toLocaleString("en-IN")}
              {a.payment_status !== "paid" && (
                <span className="text-slate-400 font-normal"> (estimated)</span>
              )}
              {a.paid_at && (
                <span className="text-slate-400 font-normal">
                  {" "}
                  • paid {new Date(a.paid_at).toLocaleString("en-IN")}
                </span>
              )}
            </p>
          </div>

          {a.notes && (
            <div>
              <p className="text-slate-400">Notes</p>
              <p className="text-slate-700">{a.notes}</p>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <p className="font-bold text-slate-800">Ratings &amp; Feedback</p>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-slate-400">Patient</p>
                {a.patient_rating !== null && (
                  <button
                    onClick={() => handleClearRating("patient")}
                    disabled={clearingRole === "patient"}
                    className="text-[10px] text-red-600 font-semibold hover:underline disabled:opacity-60"
                  >
                    {clearingRole === "patient" ? "Clearing..." : "Clear (let them re-rate)"}
                  </button>
                )}
              </div>
              {a.patient_rating ? (
                <>
                  <Stars rating={a.patient_rating} />
                  {a.patient_feedback && (
                    <p className="text-slate-700 mt-0.5">{a.patient_feedback}</p>
                  )}
                </>
              ) : (
                <p className="text-slate-400">Not yet rated.</p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-slate-400">Therapist</p>
                {a.therapist_rating !== null && (
                  <button
                    onClick={() => handleClearRating("therapist")}
                    disabled={clearingRole === "therapist"}
                    className="text-[10px] text-red-600 font-semibold hover:underline disabled:opacity-60"
                  >
                    {clearingRole === "therapist" ? "Clearing..." : "Clear (let them re-rate)"}
                  </button>
                )}
              </div>
              {a.therapist_rating ? (
                <>
                  <Stars rating={a.therapist_rating} />
                  {a.therapist_feedback && (
                    <p className="text-slate-700 mt-0.5">{a.therapist_feedback}</p>
                  )}
                </>
              ) : (
                <p className="text-slate-400">Not yet rated.</p>
              )}
            </div>
          </div>

          {history.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="font-bold text-slate-800 mb-2">Reassignment History</p>
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="text-slate-500">
                    <span className="text-slate-400">
                      {new Date(h.changed_at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                      IST —{" "}
                    </span>
                    {h.old_therapist_id !== h.new_therapist_id && (
                      <span className="block">
                        Therapist: {nameOrUnassigned(h.old_therapist_id)} →{" "}
                        <strong className="text-slate-700">
                          {nameOrUnassigned(h.new_therapist_id)}
                        </strong>
                      </span>
                    )}
                    {h.old_slot_time !== h.new_slot_time && (
                      <span className="block">
                        Time:{" "}
                        {h.old_slot_time
                          ? new Date(h.old_slot_time).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                            })
                          : "—"}{" "}
                        →{" "}
                        <strong className="text-slate-700">
                          {h.new_slot_time
                            ? new Date(h.new_slot_time).toLocaleString("en-IN", {
                                timeZone: "Asia/Kolkata",
                              })
                            : "—"}
                        </strong>
                      </span>
                    )}
                    {h.old_category_id !== h.new_category_id && (
                      <span className="block">
                        Category: {categoryOrNone(h.old_category_id)} →{" "}
                        <strong className="text-slate-700">
                          {categoryOrNone(h.new_category_id)}
                        </strong>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canReassign && (
            <div className="pt-3 border-t border-slate-100">
              <p className="font-bold text-slate-800 mb-2">Reassign Session</p>
              {therapists.length === 0 ? (
                <p className="text-slate-400">
                  No approved therapists available to reassign to.
                </p>
              ) : (
                <EditBookingForm
                  appointmentId={a.id}
                  currentTherapistId={a.therapist_id}
                  currentSlotTime={a.slot_time}
                  currentCategoryId={a.category_id}
                  therapists={therapists}
                  categories={categories}
                  onSaved={onClose}
                />
              )}
            </div>
          )}

          {a.status === "completed" && (
            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={handleReopen}
                disabled={reopening}
                className="text-red-600 font-semibold hover:underline disabled:opacity-60"
              >
                {reopening ? "Reopening..." : "Reopen Session (undo Done)"}
              </button>
              <p className="text-[11px] text-slate-400 mt-1">
                Reverts to Confirmed and clears any ratings/feedback already submitted.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
