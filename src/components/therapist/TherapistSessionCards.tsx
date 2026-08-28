import Link from "next/link";
import CompleteSessionButton from "@/components/CompleteSessionButton";
import MarkNoShowButton from "@/components/MarkNoShowButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import SessionNoteButton from "@/components/therapist/SessionNoteButton";
import JoinSessionButton from "@/components/JoinSessionButton";
import CollectCashButton from "@/components/CollectCashButton";
import PackageChip from "@/components/packages/PackageChip";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { formatAddressBlock, mapsSearchUrl, visitAddressFromAppointment } from "@/lib/formatAddress";
import { isNoteEditable, noteEditHoursLeft } from "@/lib/sessionNotes";
import type { TherapistDashboardData } from "@/lib/therapistDashboardData";

const STATUS_BADGE_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-purple-700 bg-purple-50",
  completed: "text-teal-700 bg-teal-50",
  cancelled: "text-red-700 bg-red-50",
};

// A completed session with no_show=true is otherwise visually identical to
// one that actually happened, so it gets its own badge colour.
const NO_SHOW_STYLE = "text-orange-700 bg-orange-50";

// The two session cards a therapist sees -- a video consultation and a
// home visit. They were closures inside the old single-page dashboard;
// now that Assigned Sessions, Home Visits and the Calendar are separate
// routes they have to be real components, or the three would drift.
export function renderTherapistSessionCard(
  d: TherapistDashboardData,
  a: TherapistDashboardData["appointments"][number]
) {
  const {
    patientMap,
    noteByAppointmentId,
    nowMs: nowMsForOverview,
    recommendablePackages,
  } = d;
    const patient = patientMap.get(a.patient_id);
    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-slate-900">
              {patient?.full_name ?? "Unknown patient"}
            </p>
            <p className="text-slate-500">
              {patient?.phone || patient?.email || "No contact on file"}
            </p>
            {a.patient_id && (
              <Link
                href={`/therapist/dashboard/health-profile/${a.patient_id}`}
                className="inline-block mt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                View Health Profile →
              </Link>
            )}
          </div>
          <span
            className={`capitalize font-semibold px-3 py-1 rounded-full ${
              a.no_show ? NO_SHOW_STYLE : STATUS_BADGE_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
            }`}
          >
            {a.no_show ? "No-Show" : a.status}
          </span>
        </div>
        <p className="font-bold text-sm text-slate-900">
          {a.concern ?? "General Consultation"}
          {a.session_code && (
            <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
              {a.session_code}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500">
          {formatSlotTime(a.slot_time, a.timezone)}
          {a.duration_minutes && ` • ${a.duration_minutes} min`}
        </p>
        {a.notes && (
          <p className="text-slate-500">
            <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
          </p>
        )}
        {a.package_purchase_id && <PackageChip purchaseId={a.package_purchase_id} />}
        <div className="flex items-center gap-2 flex-wrap">
          <JoinSessionButton
            meetLink={a.meet_link}
            slotTime={a.slot_time}
            status={a.status}
            durationMinutes={a.duration_minutes}
          />
          {a.status === "confirmed" && (
            <>
              <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
              <MarkNoShowButton appointmentId={a.id} />
            </>
          )}
          {/* The note lives on the card, not behind the patient's chart:
              the moment a therapist can write an accurate note is the
              moment they finish and are still looking at the session. */}
          {!a.no_show &&
            (a.status === "completed" ||
              (a.status === "confirmed" && !!a.slot_time && new Date(a.slot_time).getTime() < nowMsForOverview)) && (
              <SessionNoteButton
                appointmentId={a.id}
                patientName={patient?.full_name ?? "Patient"}
                sessionLabel={formatSlotTime(a.slot_time, a.timezone)}
                note={noteByAppointmentId.get(a.id) ?? null}
                editable={
                  !noteByAppointmentId.has(a.id) ||
                  isNoteEditable(noteByAppointmentId.get(a.id)!, nowMsForOverview)
                }
                hoursLeft={
                  noteByAppointmentId.has(a.id)
                    ? noteEditHoursLeft(noteByAppointmentId.get(a.id)!, nowMsForOverview)
                    : null
                }
                patientId={a.patient_id}
                sessionCompleted={a.status === "completed"}
                recommendable={recommendablePackages}
              />
            )}
        </div>
        {a.status === "completed" && !a.no_show && (
          <SessionFeedbackForm
            appointmentId={a.id}
            role="therapist"
            existingRating={a.therapist_rating}
            existingFeedback={a.therapist_feedback}
          />
        )}
      </div>
    );
  }

  // The home-visit twin of renderAppointmentCard. A separate function
  // rather than branches inside that one: almost every line differs (an
  // address block and a map link instead of a Join button, a cash badge,
  // no Meet link at all), and interleaving the two would make both harder
  // to read than having them side by side.
export function renderTherapistHomeVisitCard(
  d: TherapistDashboardData,
  a: TherapistDashboardData["appointments"][number]
) {
  const {
    patientMap,
    homeVisitPerVisitFeeByPurchaseId,
  } = d;
    const patient = patientMap.get(a.patient_id);
    const visit = a.visit;
    const visitAddress = visit ? visitAddressFromAppointment(visit) : null;
    const addressLines = visitAddress ? formatAddressBlock(visitAddress) : [];
    const mapsUrl = visitAddress ? mapsSearchUrl(visitAddress) : null;
    // The number to ring at the door, which may deliberately differ from
    // the account holder's -- an elderly patient's booking is often made
    // by a relative.
    const callNumber = visit?.visit_contact_phone || patient?.phone || null;
    // An unpaid home visit is a cash-at-the-door booking by definition:
    // the prepaid path marks the appointment paid at creation, so anything
    // still unpaid here is money the therapist collects on arrival.
    const cashDue = a.payment_status !== "paid" && !visit?.cash_collected_at;

    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-slate-900">{patient?.full_name ?? "Unknown patient"}</p>
            {callNumber ? (
              <a href={`tel:${callNumber}`} className="text-teal-700 font-semibold hover:underline">
                {callNumber}
              </a>
            ) : (
              <p className="text-slate-500">{patient?.email || "No contact on file"}</p>
            )}
            {a.patient_id && (
              <Link
                href={`/therapist/dashboard/health-profile/${a.patient_id}`}
                className="inline-block mt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                View Health Profile →
              </Link>
            )}
          </div>
          <span
            className={`capitalize font-semibold px-3 py-1 rounded-full ${
              a.no_show ? NO_SHOW_STYLE : STATUS_BADGE_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
            }`}
          >
            {a.no_show ? "No-Show" : a.status}
          </span>
        </div>

        <p className="font-bold text-sm text-slate-900">
          {a.concern ?? "Home Physiotherapy Visit"}
          {a.session_code && (
            <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
              {a.session_code}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500">
          {formatSlotTime(a.slot_time, a.timezone)}
          {a.duration_minutes && ` • ${a.duration_minutes} min`}
        </p>

        {addressLines.length > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Address
            </p>
            {addressLines.map((line) => (
              <p key={line} className="text-slate-700">
                {line}
              </p>
            ))}
            {visit?.visit_access_notes && (
              <p className="text-slate-600 pt-1">
                <span className="font-semibold text-slate-400">Getting in:</span>{" "}
                {visit.visit_access_notes}
              </p>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                <i className="fa-solid fa-location-dot" /> Open in Maps
              </a>
            )}
          </div>
        )}

        {a.notes && (
          <p className="text-slate-500">
            <span className="font-semibold text-slate-400">Notes:</span> {a.notes}
          </p>
        )}

        {cashDue && (
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <p className="mb-2 font-semibold text-amber-800">
              <i className="fa-solid fa-indian-rupee-sign mr-1.5" />
              Collect payment at the door
            </p>
            <CollectCashButton
              appointmentId={a.id}
              amountPaise={
                (visit?.home_visit_purchase_id
                  ? homeVisitPerVisitFeeByPurchaseId.get(visit.home_visit_purchase_id) ?? 0
                  : 0) + Math.max(0, visit?.travel_fee_paise ?? 0)
              }
            />
          </div>
        )}
        {visit?.cash_collected_at && (
          <p className="text-teal-700 font-semibold">
            <i className="fa-solid fa-circle-check mr-1.5" />
            Cash collected
            {visit.cash_collected_amount_paise
              ? ` — ₹${(visit.cash_collected_amount_paise / 100).toLocaleString("en-IN")}`
              : ""}
          </p>
        )}

        {/* No JoinSessionButton: there is nothing to join, the therapist is
            travelling to the address above. */}
        {a.status === "confirmed" && (
          <div className="flex items-center gap-2 flex-wrap">
            <CompleteSessionButton appointmentId={a.id} slotTime={a.slot_time} />
            <MarkNoShowButton appointmentId={a.id} />
          </div>
        )}

        {a.status === "completed" && !a.no_show && (
          <SessionFeedbackForm
            appointmentId={a.id}
            role="therapist"
            existingRating={a.therapist_rating}
            existingFeedback={a.therapist_feedback}
          />
        )}
      </div>
    );
  }

  // Same computation as the root layout's own showDebugNav -- duplicated
  // here (rather than threaded through props from a layout) because this
  // page hides the shared Navbar entirely and needs the same dev-only-bar
  // offset for its own fixed sidebar. See DashboardShell's offsetTop prop.
