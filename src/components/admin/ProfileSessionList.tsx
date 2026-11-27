"use client";

import ProgrammeIdChip from "@/components/dashboard/ProgrammeIdChip";
import type { ProgrammeTag } from "@/lib/programmeId";
import { useState } from "react";
import Link from "next/link";
import EditBookingForm from "@/components/admin/EditBookingForm";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import MarkNoShowButton from "@/components/MarkNoShowButton";
import MarkPaidByCashButton from "@/components/admin/MarkPaidByCashButton";
import RefundChip from "@/components/admin/RefundChip";
import JoinSessionButton from "@/components/JoinSessionButton";
import SessionDetailDrawer, {
  type SessionDetailAppointment,
} from "@/components/admin/SessionDetailDrawer";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { sessionListPricePaise } from "@/lib/sessionListPrice";
import { describeSessionPayment } from "@/lib/sessionPaymentState";
import { sortSessionsNewestFirst } from "@/lib/sessionOrdering";
import { rowActivationProps } from "@/lib/rowActivation";
import { formatRupees } from "@/lib/formatMoney";

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
const PAYMENT_CHIP_TONE: Record<string, string> = {
  good: "text-green-700 bg-green-50",
  warn: "text-amber-700 bg-amber-50",
  bad: "text-red-700 bg-red-50",
  neutral: "text-slate-600 bg-slate-100",
};

export default function ProfileSessionList({
  variant,
  appointments,
  peopleMap,
  categoryMap,
  therapists,
  categories,
  emptyMessage,
  canSeeMoney,
  canManageSessions,
  programmeTags = {},
}: {
  variant: "therapist" | "patient";
  appointments: SessionDetailAppointment[];
  peopleMap: Map<string, string>;
  categoryMap: Map<string, Category>;
  therapists: { id: string; full_name: string; active?: boolean }[];
  categories: Category[];
  emptyMessage: string;
  // This list renders on the Patient and Therapist pages, which every admin
  // scope can open -- unlike the Sessions and Money sections the controls
  // below actually belong to. Their routes guard with requireAdminScope, so
  // without these a finance admin would see Reassign and a clinical admin
  // would see Mark Paid, both answering 403.
  canSeeMoney: boolean;
  canManageSessions: boolean;
  /** The programme each session came from (PED_PKG001-2/6), by appointment. */
  programmeTags?: Record<string, ProgrammeTag>;
}) {
  // The id, not the row: a copy taken when the pop-up opened kept showing the
  // old price and history after Approve, Assign or Goodwill refreshed the
  // page, until the screen was reloaded. The row is looked up in the props,
  // which a refresh replaces.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedAppointment: SessionDetailAppointment | null =
    (selectedId ? appointments.find((a) => a.id === selectedId) : null) ?? null;
  const setSelectedAppointment = (a: SessionDetailAppointment | null) => setSelectedId(a ? a.id : null);
  // Lazy initializer -- read once on mount, not on every render, satisfying
  // the "no impure calls during render" rule while still being "now enough"
  // for an isUpcoming check that only needs to be roughly current.
  const [now] = useState(() => Date.now());

  if (appointments.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">{emptyMessage}</p>;
  }

  // Ordered here rather than by whichever query fetched the rows: this one
  // component renders the list on both the patient and the therapist profile,
  // so the two screens cannot grow two answers to "what order is this in", and
  // a third caller added later gets the order without having to remember it.
  // Same posture as SessionNoteHistory and the drawer's reassignment log,
  // which both sort what they are handed.
  const ordered = sortSessionsNewestFirst(appointments);

  return (
    <>
      <ul className="space-y-3 text-xs">
        {ordered.map((a) => {
          const category = a.category_id ? categoryMap.get(a.category_id) : null;
          const feePaise = sessionListPricePaise(a, category?.price_paise);
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
              {...rowActivationProps(() => setSelectedAppointment(a))}
              className="p-4 rounded-xl border border-slate-200 space-y-1.5 cursor-pointer hover:border-teal-300 transition focus:outline-none focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
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
                  {/* Read through the one module rather than printing the
                      column, or a trusted patient's delivered session says
                      "unpaid" beside an abandoned checkout saying the same
                      word -- on the screen an admin chases people from. */}
                  {(() => {
                    const pay = describeSessionPayment(a);
                    return (
                      <span
                        className={`font-semibold px-2.5 py-1 rounded-full ${PAYMENT_CHIP_TONE[pay.tone]}`}
                      >
                        {pay.label}
                      </span>
                    );
                  })()}
                  {/* Beside the payment, because it is the same question
                      asked in the other direction. This list is where the
                      gap was reported: an admin refunded from a patient's
                      profile and the row said nothing at all. */}
                  {canSeeMoney && <RefundChip row={a} />}
                </div>
              </div>
              <p className="text-slate-500">
                {variant === "therapist" ? `${a.concern ?? "General Consultation"} • ` : ""}
                {formatSlotTime(a.slot_time, a.timezone)} • {durationMinutes} min • ₹
                {formatRupees(feePaise)}
                {a.session_code && (
                  <span className="ml-1 font-mono text-slate-500">• {a.session_code}</span>
                )}
              </p>
              {programmeTags[a.id] && (
                <p className="flex flex-wrap items-center gap-1.5 text-slate-500">
                  Part of <ProgrammeIdChip tag={programmeTags[a.id]} size="xs" />
                </p>
              )}
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
                  <span className="font-semibold text-slate-500">Notes:</span> {a.notes}
                </p>
              )}
              {canManageSessions && isUpcoming && (
                <div onClick={(e) => e.stopPropagation()}>
                  <EditBookingForm
                    appointmentId={a.id}
                    currentTherapistId={a.therapist_id}
                    currentSlotTime={a.slot_time}
                    timeZone={a.timezone}
                    therapists={therapists}
                  />
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <JoinSessionButton
                  meetLink={a.meet_link}
                  slotTime={a.slot_time}
                  status={a.status}
                  durationMinutes={durationMinutes}
                  alwaysActive
                />
                {/* Completing a session is what makes a therapist's share
                    payable, so it is a Sessions write like any other and the
                    route now refuses a scope that only reads them. A control
                    an admin's scope cannot call must not render, or Finance
                    gets a 403 with nothing on screen to explain it. */}
                {/* Also only once the session has started: the route refuses Done
                    before that for everyone, so the button would only lead to a
                    refusal (and an early Done is how Therapist Home came to read
                    "1 of 1 done" with a 6 PM session still ahead). */}
                {canManageSessions &&
                  a.status === "confirmed" &&
                  !!a.slot_time &&
                  Date.parse(a.slot_time) <= now && (
                  <>
                    <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
                    <MarkNoShowButton appointmentId={a.id} />
                  </>
                )}
                {/* Not for a pay-later session: that is settled through the
                    patient's balance, and the route refuses it. */}
                {canSeeMoney &&
                  a.payment_status !== "paid" &&
                  a.payment_terms !== "pay_later" &&
                  (a.status === "requested" || a.status === "confirmed") && (
                    <MarkPaidByCashButton appointmentId={a.id} />
                  )}
              </div>
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
          canSeeMoney={canSeeMoney}
          canManageSessions={canManageSessions}
          programmeTag={programmeTags[selectedAppointment.id] ?? null}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </>
  );
}
