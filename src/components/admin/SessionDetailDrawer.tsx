"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EditBookingForm from "@/components/admin/EditBookingForm";
import AssignTherapistForm from "@/components/admin/AssignTherapistForm";
import JoinSessionButton from "@/components/JoinSessionButton";
import { formatSlotRange } from "@/lib/formatSlotRange";
import { SESSION_FEE_PAISE, BASE_DURATION_MINUTES, CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import PartialRefundForm from "@/components/admin/PartialRefundForm";
import { useConfirm } from "@/lib/useConfirm";
import { usePrompt } from "@/lib/usePrompt";
import {
  HomeVisitAddressEditor,
  HomeVisitAssignForm,
  type HomeVisitRow,
} from "@/components/admin/HomeVisitVisitActions";
import {
  formatAddressBlock,
  mapsSearchUrl,
  visitAddressFromAppointment,
} from "@/lib/formatAddress";

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
  patient_rating_excluded: boolean;
  therapist_rating: number | null;
  therapist_feedback: string | null;
  therapist_rating_excluded: boolean;
  cancellation_reason: string | null;
  refund_status: string | null;
  refund_amount_paise: number | null;
  package_purchase_id: string | null;
  // Who the patient asked for at booking (/team's "book this therapist", or
  // the wizard's "same therapist again"). Only a request -- the admin is the
  // one who can see whether they are free -- but the assign control leads
  // with it rather than making the admin remember it. Optional for the same
  // reason session_code is: every existing caller of this shared type keeps
  // compiling.
  preferred_therapist_id?: string | null;
  therapist_payout_paid_at: string | null;
  no_show: boolean;
  // New/migration-dependent (see supabase/schema.sql's "Unique display IDs"
  // section) -- optional so every existing caller of this shared type keeps
  // compiling even before it starts fetching the column.
  session_code?: string | null;
  // New/migration-dependent (see supabase/schema.sql's Google Calendar
  // section) -- same optional-field convention as session_code above.
  meet_link?: string | null;
};

export type ReassignmentLogEntry = {
  id: string;
  appointment_id: string;
  changed_at: string;
  changed_by: string | null;
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
  homeVisit,
  canSeeMoney = true,
  canManageSessions = true,
  onClose,
}: {
  appointment: SessionDetailAppointment;
  peopleMap: Map<string, string>;
  categoryMap: Map<string, CategoryInfo>;
  therapists: { id: string; full_name: string; active?: boolean }[];
  categories: CategoryInfo[];
  reassignmentLogs: ReassignmentLogEntry[];
  // Present only when this session is a home visit. Everything a visit needs
  // that an online session doesn't -- the address it is delivered to, and
  // the cash that may have changed hands there -- rather than a second
  // drawer for the same entity. See the home-visit panel below.
  homeVisit?: HomeVisitRow | null;
  // What the viewing admin's scope actually lets them do. The routes behind
  // these controls guard with requireAdminScope, so rendering one to an
  // admin whose scope can't call it produces a 403 they have no way to
  // interpret. Default true because the drawer's own sections (Schedule,
  // All Sessions) are only reachable by a scope that can open them; the
  // person pages, which every scope can open, pass the real values.
  canSeeMoney?: boolean;
  canManageSessions?: boolean;
  onClose: () => void;
}) {
  const [reopening, setReopening] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [clearingRole, setClearingRole] = useState<"patient" | "therapist" | null>(null);
  const [isClearPending, startClearTransition] = useTransition();
  // Prop-derived base: flips the toggle instantly instead of waiting on the
  // fetch + router.refresh() round trip -- unlike Clear, which closes the
  // drawer outright because it's a bigger, rating-erasing action. Reverts to
  // the real prop on failure (no refresh happens); matches the new prop on
  // success once router.refresh() lands.
  const [optimisticExcluded, setOptimisticExcluded] = useOptimistic({
    patient: a.patient_rating_excluded,
    therapist: a.therapist_rating_excluded,
  });
  const [excludingRole, setExcludingRole] = useState<"patient" | "therapist" | null>(null);
  const [isExcludePending, startExcludeTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { prompt, dialog: promptDialog } = usePrompt();

  const feePaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
  const durationMinutes = a.duration_minutes ?? BASE_DURATION_MINUTES;
  const canReassign = a.status === "requested" || a.status === "confirmed";
  // Assigning and reassigning are different jobs with different words. A
  // session nobody has ever been assigned to needs one tap ("Assign &
  // Confirm", honouring the therapist the patient asked for); a session that
  // already has one needs the fuller reschedule form. Showing only the
  // latter is what left an unassigned session reading "Reschedule /
  // Reassign", a verb for something that never happened.
  const needsAssigning = canReassign && !a.therapist_id;
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

  async function submitReopen(overridePayoutSettled: boolean) {
    setReopening(true);
    setActionError(null);
    const res = await fetch("/api/admin/reopen-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: a.id, overridePayoutSettled }),
    });
    const data = await res.json().catch(() => ({}));
    setReopening(false);
    if (!res.ok) {
      if (data.payoutSettled && !overridePayoutSettled) {
        // This session's cash payout to the therapist was already settled.
        // Reopening it won't be re-tracked for a future payout automatically,
        // so make the admin explicitly own that before letting them proceed.
        if (
          await confirm(
            "This session's payout has already been settled in cash to the therapist. Reopening it will NOT automatically flag it for a future payout — you'll need to track that manually if the session is redelivered. Reopen anyway?"
          )
        ) {
          await submitReopen(true);
        }
        return;
      }
      setActionError(data.error ?? "Could not reopen this session.");
      return;
    }
    router.refresh();
    onClose();
  }

  async function handleReopen() {
    if (
      !(await confirm(
        "Reopen this session? It goes back to Confirmed, reassignment unlocks again, and any ratings/feedback already submitted will be cleared."
      ))
    ) {
      return;
    }
    await submitReopen(false);
  }

  async function submitCancel(reason: string, overridePayoutSettled: boolean) {
    setCancelling(true);
    setActionError(null);
    const res = await fetch("/api/admin/cancel-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: a.id, reason, overridePayoutSettled }),
    });
    const data = await res.json().catch(() => ({}));
    setCancelling(false);
    if (!res.ok) {
      if (data.payoutSettled && !overridePayoutSettled) {
        // This session's cash payout to the therapist was already settled.
        // Cancelling can't claw that back automatically, so make the admin
        // explicitly own that before letting them proceed.
        if (
          await confirm(
            "This session's payout has already been settled in cash to the therapist. Cancelling it now will NOT automatically reclaim that money — you'll need to recover it from the therapist directly if that's warranted. Cancel anyway?"
          )
        ) {
          await submitCancel(reason, true);
        }
        return;
      }
      setActionError(data.error ?? "Could not cancel this session.");
      if (res.status === 409) {
        // Someone else (the patient, or another admin) already cancelled
        // this session — refresh so the underlying list reflects that,
        // even though this open drawer still shows the stale snapshot.
        router.refresh();
      }
      return;
    }
    router.refresh();
    if (data.refundFailed) {
      // Stay open instead of the usual auto-close so this doesn't get
      // missed — the session is cancelled either way, but the refund needs
      // manual follow-up.
      setActionError(
        "Session cancelled, but the automatic refund failed. Please process the refund manually."
      );
      return;
    }
    onClose();
  }

  async function handleCancel() {
    const hoursUntilSlot = a.slot_time
      ? (new Date(a.slot_time).getTime() - Date.now()) / (1000 * 60 * 60)
      : null;
    const isLate = hoursUntilSlot !== null && hoursUntilSlot < CANCELLATION_FULL_REFUND_HOURS;
    const reason = await prompt(
      a.payment_status === "paid" && isLate
        ? `Cancel this session? It's within ${CANCELLATION_FULL_REFUND_HOURS} hours of the slot, so the patient won't be refunded. Add a reason (optional):`
        : a.payment_status === "paid"
        ? "Cancel this session and refund the payment? Add a reason (optional):"
        : "Cancel this session? Add a reason (optional):"
    );
    if (reason === null) return;
    await submitCancel(reason, false);
  }

  async function handleClearRating(role: "patient" | "therapist") {
    if (!(await confirm(`Clear the ${role}'s rating so they can submit it again?`))) return;
    setActionError(null);
    startClearTransition(async () => {
      setClearingRole(role);
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
    });
  }

  function handleToggleExcluded(role: "patient" | "therapist", nextExcluded: boolean) {
    setActionError(null);
    startExcludeTransition(async () => {
      setExcludingRole(role);
      setOptimisticExcluded({ ...optimisticExcluded, [role]: nextExcluded });
      const res = await fetch("/api/admin/exclude-session-rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: a.id, role, excluded: nextExcluded }),
      });
      const data = await res.json().catch(() => ({}));
      setExcludingRole(null);
      if (!res.ok) {
        setActionError(data.error ?? "Could not update this rating.");
        return;
      }
      // No onClose() needed here for the drawer itself, but the underlying
      // list (average shown elsewhere on the page) does need to pick up the
      // new excluded flag next time it's fetched.
      router.refresh();
    });
  }

  return (
    <div
      // backdrop-blur-sm matches the platform-wide pop-up convention (see
      // Modal.tsx) -- every full-page overlay blurs the page behind it, not
      // just dims it.
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 text-xs"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Session Details</h3>
            {a.session_code && (
              <p className="font-mono text-[11px] text-slate-400 mt-0.5">{a.session_code}</p>
            )}
          </div>
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
            {a.status === "completed" && a.no_show && (
              <span className="capitalize font-semibold px-2.5 py-1 rounded-full text-slate-600 bg-slate-100">
                No-Show
              </span>
            )}
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

          {a.meet_link && (
            <div>
              <p className="text-slate-400">Session Meeting</p>
              <JoinSessionButton
                meetLink={a.meet_link}
                slotTime={a.slot_time}
                status={a.status}
                durationMinutes={durationMinutes}
                alwaysActive
              />
            </div>
          )}

          <div>
            <p className="text-slate-400">Price</p>
            <p className="font-semibold text-slate-800">
              ₹{(feePaise / 100).toLocaleString("en-IN")}
              {a.payment_status !== "paid" && (
                <span className="text-slate-400 font-normal"> (estimated)</span>
              )}
              {a.package_purchase_id && (
                <span className="text-teal-700 font-normal">
                  {" "}
                  • paid via package (no separate Razorpay payment for this session)
                </span>
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

          {a.status === "cancelled" && (
            <div>
              <p className="text-slate-400">Cancellation</p>
              <p className="text-slate-700">
                {a.refund_status === "processed" && a.refund_amount_paise
                  ? `₹${(a.refund_amount_paise / 100).toLocaleString("en-IN")} refunded`
                  : a.refund_status === "not_eligible"
                  ? a.therapist_payout_paid_at
                    ? "No refund (this session's payout was already settled — cancelled as an admin correction, not a late cancellation)"
                    : `No refund (cancelled within ${CANCELLATION_FULL_REFUND_HOURS} hours of the slot)`
                  : "No payment to refund"}
              </p>
              {a.cancellation_reason && (
                <p className="text-slate-500 mt-0.5">Reason: {a.cancellation_reason}</p>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <p className="font-bold text-slate-800">Ratings &amp; Feedback</p>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-slate-400">Patient</p>
                {canManageSessions && a.patient_rating !== null && (
                  <>
                    <button
                      onClick={() => handleToggleExcluded("patient", !optimisticExcluded.patient)}
                      disabled={isExcludePending && excludingRole === "patient"}
                      className={`text-[10px] font-semibold hover:underline disabled:opacity-60 ${
                        optimisticExcluded.patient ? "text-amber-600" : "text-slate-500"
                      }`}
                    >
                      {optimisticExcluded.patient
                        ? "Excluded from average — include it"
                        : "Exclude from average"}
                    </button>
                    <button
                      onClick={() => handleClearRating("patient")}
                      disabled={isClearPending && clearingRole === "patient"}
                      className="text-[10px] text-red-600 font-semibold hover:underline disabled:opacity-60"
                    >
                      {isClearPending && clearingRole === "patient"
                        ? "Clearing..."
                        : "Clear (let them re-rate)"}
                    </button>
                  </>
                )}
              </div>
              {a.patient_rating ? (
                <>
                  <Stars rating={a.patient_rating} />
                  {optimisticExcluded.patient && (
                    <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      Excluded from average
                    </span>
                  )}
                  {a.patient_feedback && (
                    <p className="text-slate-700 mt-0.5">{a.patient_feedback}</p>
                  )}
                </>
              ) : (
                <p className="text-slate-400">Not yet rated.</p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-slate-400">Therapist</p>
                {canManageSessions && a.therapist_rating !== null && (
                  <>
                    <button
                      onClick={() =>
                        handleToggleExcluded("therapist", !optimisticExcluded.therapist)
                      }
                      disabled={isExcludePending && excludingRole === "therapist"}
                      className={`text-[10px] font-semibold hover:underline disabled:opacity-60 ${
                        optimisticExcluded.therapist ? "text-amber-600" : "text-slate-500"
                      }`}
                    >
                      {optimisticExcluded.therapist
                        ? "Excluded from average — include it"
                        : "Exclude from average"}
                    </button>
                    <button
                      onClick={() => handleClearRating("therapist")}
                      disabled={isClearPending && clearingRole === "therapist"}
                      className="text-[10px] text-red-600 font-semibold hover:underline disabled:opacity-60"
                    >
                      {isClearPending && clearingRole === "therapist"
                        ? "Clearing..."
                        : "Clear (let them re-rate)"}
                    </button>
                  </>
                )}
              </div>
              {a.therapist_rating ? (
                <>
                  <Stars rating={a.therapist_rating} />
                  {optimisticExcluded.therapist && (
                    <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      Excluded from average
                    </span>
                  )}
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
                      IST{h.changed_by && ` by ${nameOrUnassigned(h.changed_by)}`} —{" "}
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

          {canManageSessions && canReassign && (
            <div className="pt-3 border-t border-slate-100">
              <p className="font-bold text-slate-800 mb-2">
                {needsAssigning ? "Assign a therapist" : "Reassign Session"}
              </p>
              {therapists.length === 0 ? (
                <p className="text-slate-400">
                  No approved therapists available to {needsAssigning ? "assign" : "reassign to"}.
                </p>
              ) : (
                <>
                  {needsAssigning && (
                    <div className="mb-2">
                      <AssignTherapistForm
                        appointmentId={a.id}
                        therapists={therapists.filter((t) => t.active !== false)}
                        preferredTherapistId={a.preferred_therapist_id ?? null}
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Confirms the session at the time it was booked for. Use the
                        control below instead if the time has to move too.
                      </p>
                    </div>
                  )}
                  <EditBookingForm
                    appointmentId={a.id}
                    currentTherapistId={a.therapist_id}
                    currentSlotTime={a.slot_time}
                    currentCategoryId={a.category_id}
                    therapists={therapists}
                    categories={categories}
                    onSaved={onClose}
                  />
                </>
              )}
            </div>
          )}

          {homeVisit && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="font-bold text-slate-700">Home visit</p>
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                {(() => {
                  const address = visitAddressFromAppointment(homeVisit);
                  const lines = formatAddressBlock(address);
                  const mapsUrl = mapsSearchUrl(address);
                  return (
                    <>
                      {lines.length > 0 ? (
                        lines.map((line) => (
                          <p key={line} className="text-slate-700">
                            {line}
                          </p>
                        ))
                      ) : (
                        <p className="text-red-600">No address on this visit.</p>
                      )}
                      {homeVisit.visit_contact_phone && (
                        <p className="text-slate-600">
                          Call on arrival: {homeVisit.visit_contact_phone}
                        </p>
                      )}
                      {homeVisit.visit_access_notes && (
                        <p className="text-slate-600">
                          <span className="font-semibold text-slate-400">Getting in:</span>{" "}
                          {homeVisit.visit_access_notes}
                        </p>
                      )}
                      <div className="flex items-center gap-3 pt-1">
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
                          onClick={() => setEditingAddress((v) => !v)}
                          className="text-[11px] font-semibold text-slate-600 hover:underline"
                        >
                          {editingAddress ? "Close" : "Edit address"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {editingAddress && (
                <HomeVisitAddressEditor
                  visit={homeVisit}
                  onDone={() => setEditingAddress(false)}
                />
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <p className="text-slate-400">Travel fee</p>
                  <p className="font-semibold text-slate-700">
                    {homeVisit.travel_fee_paise
                      ? `₹${(homeVisit.travel_fee_paise / 100).toLocaleString("en-IN")}`
                      : "—"}
                  </p>
                  <p className="text-slate-400">Paid to the therapist in full.</p>
                </div>
                <div>
                  <p className="text-slate-400">Cash</p>
                  <p className="font-semibold text-slate-700">
                    {homeVisit.cash_collected_at
                      ? `Collected ₹${((homeVisit.cash_collected_amount_paise ?? 0) / 100).toLocaleString("en-IN")}`
                      : homeVisit.payment_status === "paid"
                        ? "Prepaid"
                        : "Cash on visit, not yet collected"}
                  </p>
                  {homeVisit.cash_collected_at && (
                    <p className="text-slate-400">
                      {homeVisit.cash_remitted_at ? "Remitted" : "Not yet remitted"}
                    </p>
                  )}
                </div>
              </div>

              {/* A visit still open enough to send someone to. Assignment
                  runs the same route as an online session -- the padding
                  for travel time is applied server-side, not here. */}
              {canManageSessions && homeVisit.status !== "cancelled" && homeVisit.status !== "completed" && (
                <HomeVisitAssignForm
                  visit={homeVisit}
                  therapists={therapists.filter((t) => t.active !== false)}
                />
              )}
            </div>
          )}

          {canManageSessions && a.status === "completed" && (
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

          {/* Discretionary refunds are separate from cancelling on purpose:
              cancelling frees the slot and applies the automatic all-or-
              nothing rule, while this returns money on a session that may
              well still be going ahead. */}
          {canSeeMoney && a.payment_status === "paid" && (
            <div className="pt-3 border-t border-slate-100">
              <p className="font-bold text-slate-700 mb-1">Refund</p>
              <PartialRefundForm
                appointmentId={a.id}
                paidPaise={a.amount_paid_paise ?? 0}
                alreadyRefundedPaise={a.refund_amount_paise ?? 0}
              />
            </div>
          )}

          {canManageSessions && canReassign && (
            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-red-600 font-semibold hover:underline disabled:opacity-60"
              >
                {cancelling ? "Cancelling..." : "Cancel Session"}
              </button>
              {a.payment_status === "paid" && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Refunds the amount paid via Razorpay as part of cancelling.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {confirmDialog}
      {promptDialog}
    </div>
  );
}
