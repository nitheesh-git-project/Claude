"use client";

import Link from "next/link";
import EditBookingForm from "@/components/admin/EditBookingForm";
import { formatSlotTime } from "@/lib/formatSlotTime";
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
  patientName,
  therapistName,
  categoryTitle,
  therapists,
  categories,
  onClose,
}: {
  appointment: SessionDetailAppointment;
  patientName: string;
  therapistName: string | null;
  categoryTitle: string | null;
  therapists: { id: string; full_name: string }[];
  categories: { id: string; title: string; price_paise: number; duration_minutes: number }[];
  onClose: () => void;
}) {
  const feePaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
  const durationMinutes = a.duration_minutes ?? BASE_DURATION_MINUTES;
  const canReassign = a.status === "requested" || a.status === "confirmed";

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
            <p className="text-slate-400">Slot</p>
            <p className="font-semibold text-slate-800">
              {formatSlotTime(a.slot_time, a.timezone)} • {durationMinutes} min
            </p>
          </div>

          <div>
            <p className="text-slate-400">Price</p>
            <p className="font-semibold text-slate-800">
              ₹{(feePaise / 100).toLocaleString("en-IN")}
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
              <p className="text-slate-400">Patient</p>
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
              <p className="text-slate-400">Therapist</p>
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

          {canReassign && therapists.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="font-bold text-slate-800 mb-2">Reassign Session</p>
              <EditBookingForm
                appointmentId={a.id}
                currentTherapistId={a.therapist_id}
                currentSlotTime={a.slot_time}
                currentCategoryId={a.category_id}
                therapists={therapists}
                categories={categories}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
