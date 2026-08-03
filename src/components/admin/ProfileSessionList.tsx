"use client";

import { useState } from "react";
import Link from "next/link";
import EditBookingForm from "@/components/admin/EditBookingForm";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import MarkNoShowButton from "@/components/MarkNoShowButton";
import SessionDetailDrawer, {
  type SessionDetailAppointment,
  type ReassignmentLogEntry,
} from "@/components/admin/SessionDetailDrawer";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES } from "@/lib/pricing";

type Category = {
  id: string;
  title: string;
  price_paise: number;
  duration_minutes: number;
};

// Same list content the admin Therapist/Patient detail pages already
// rendered as static <li> blocks (badges, EditBookingForm,
// CompleteSessionButton/MarkNoShowButton) -- the only change is that a
// click anywhere on a row (outside its interactive controls, which stop
// propagation) now opens the same SessionDetailDrawer already used in the
// Calendar/Session Story tabs, so rating/feedback/cancellation detail is
// reachable from here too.
export default function ProfileSessionList({
  variant,
  appointments,
  peopleMap,
  categoryMap,
  therapists,
  categories,
  reassignmentLogs,
  emptyMessage,
}: {
  variant: "therapist" | "patient";
  appointments: SessionDetailAppointment[];
  peopleMap: Map<string, string>;
  categoryMap: Map<string, Category>;
  therapists: { id: string; full_name: string; active?: boolean }[];
  categories: Category[];
  reassignmentLogs: ReassignmentLogEntry[];
  emptyMessage: string;
}) {
  const [selectedAppointment, setSelectedAppointment] = useState<SessionDetailAppointment | null>(
    null
  );
  // Lazy initializer -- read once on mount, not on every render, satisfying
  // the "no impure calls during render" rule while still being "now enough"
  // for an isUpcoming check that only needs to be roughly current.
  const [now] = useState(() => Date.now());

  if (appointments.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className="space-y-3 text-xs">
        {appointments.map((a) => {
          const category = a.category_id ? categoryMap.get(a.category_id) : null;
          const feePaise = a.amount_paid_paise ?? category?.price_paise ?? SESSION_FEE_PAISE;
          const durationMinutes =
            a.duration_minutes ?? category?.duration_minutes ?? BASE_DURATION_MINUTES;
          const isUpcoming =
            a.status !== "completed" &&
            a.status !== "cancelled" &&
            !!a.slot_time &&
            new Date(a.slot_time).getTime() > now;
          return (
            <li
              key={a.id}
              onClick={() => setSelectedAppointment(a)}
              className="p-4 rounded-xl border border-slate-200 space-y-1.5 cursor-pointer hover:border-teal-300 transition"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                {variant === "therapist" ? (
                  <Link
                    href={`/admin/dashboard/patients/${a.patient_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-bold text-slate-900 hover:text-teal-700 hover:underline transition"
                  >
                    {peopleMap.get(a.patient_id) ?? "Unknown patient"}
                  </Link>
                ) : (
                  <strong className="text-slate-900">{a.concern ?? "General Consultation"}</strong>
                )}
                <div className="flex gap-2">
                  <span className="capitalize font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
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
              </div>
              <p className="text-slate-500">
                {variant === "therapist" ? `${a.concern ?? "General Consultation"} • ` : ""}
                {formatSlotTime(a.slot_time, a.timezone)} • {durationMinutes} min • ₹
                {(feePaise / 100).toLocaleString("en-IN")}
              </p>
              {variant === "patient" && (
                <p className="text-slate-500">
                  Therapist:{" "}
                  {a.therapist_id ? (
                    <Link
                      href={`/admin/dashboard/therapists/${a.therapist_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-bold text-slate-700 hover:text-teal-700 hover:underline transition"
                    >
                      {peopleMap.get(a.therapist_id) ?? "Unknown"}
                    </Link>
                  ) : (
                    <strong>Not yet assigned</strong>
                  )}
                </p>
              )}
              {a.notes && (
                <p className="text-slate-500">
                  <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
                </p>
              )}
              {isUpcoming && (
                <div onClick={(e) => e.stopPropagation()}>
                  <EditBookingForm
                    appointmentId={a.id}
                    currentTherapistId={a.therapist_id}
                    currentSlotTime={a.slot_time}
                    therapists={therapists}
                  />
                </div>
              )}
              {a.status === "confirmed" && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
                  <MarkNoShowButton appointmentId={a.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {selectedAppointment && (
        <SessionDetailDrawer
          appointment={selectedAppointment}
          peopleMap={peopleMap}
          categoryMap={categoryMap}
          therapists={therapists}
          categories={categories}
          reassignmentLogs={reassignmentLogs}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </>
  );
}
