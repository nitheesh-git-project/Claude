import type { ReactNode } from "react";
import PayNowButton from "@/components/PayNowButton";
import CancelSessionButton from "@/components/CancelSessionButton";
import SessionFeedbackForm from "@/components/SessionFeedbackForm";
import PackageChip from "@/components/packages/PackageChip";
import JoinSessionButton from "@/components/JoinSessionButton";
import { formatSlotTime } from "@/lib/formatSlotTime";
import { SESSION_FEE_PAISE, CANCELLATION_FULL_REFUND_HOURS } from "@/lib/pricing";
import { visitAddressFromAppointment, formatAddressBlock, mapsSearchUrl } from "@/lib/formatAddress";
import type { PatientDashboardData } from "@/lib/patientDashboardData";

const STATUS_STYLES: Record<string, string> = {
  requested: "text-amber-700 bg-amber-50",
  confirmed: "text-teal-700 bg-teal-50",
  completed: "text-slate-600 bg-slate-100",
  cancelled: "text-red-700 bg-red-50",
};

const NO_SHOW_STYLE = "text-orange-700 bg-orange-50";

// One session card, shared by Your Sessions, Your Home Visits and the
// Calendar's day panel. It was a closure inside the old single-page
// dashboard; now that each of those is its own route it has to be a real
// component, or the three would drift into three subtly different cards.
export function renderPatientSessionCard(
  data: PatientDashboardData,
  a: PatientDashboardData["appointments"][number],
  visit: ReturnType<PatientDashboardData["visitDetailById"]["get"]> | null = null
): ReactNode {
  const { profile, therapistMap, categoryPriceMap, purchaseCodeById, adminSettings } = data;
    const visitAddress = visit ? visitAddressFromAppointment(visit) : null;
    const addressLines = visitAddress ? formatAddressBlock(visitAddress) : [];
    const mapsUrl = visitAddress ? mapsSearchUrl(visitAddress) : null;
    return (
      <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-3">
        {visit?.visit_mode === "home_visit" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-teal-700">
            <i className="fa-solid fa-house-medical" /> Home visit
          </span>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-sm text-slate-900">
              {a.concern ?? "General Consultation"}
              {a.session_code && (
                <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
                  {a.session_code}
                </span>
              )}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {formatSlotTime(a.slot_time, a.timezone)}
              {a.duration_minutes && ` • ${a.duration_minutes} min`}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Therapist:{" "}
              <span className="text-slate-700">
                {a.therapist_id
                  ? therapistMap.get(a.therapist_id) ?? "Unknown"
                  : "Not yet assigned"}
              </span>
            </p>
            {a.package_purchase_id && (
              <PackageChip purchaseId={a.package_purchase_id} label={purchaseCodeById.get(a.package_purchase_id)} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`capitalize font-semibold px-3 py-1 rounded-full ${
                a.no_show ? NO_SHOW_STYLE : STATUS_STYLES[a.status] ?? "text-slate-600 bg-slate-100"
              }`}
            >
              {a.no_show ? "No-Show" : a.status}
            </span>
            {a.status === "cancelled" ? (
              a.refund_status === "processed" ? (
                <span className="font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  Refunded
                </span>
              ) : a.refund_status === "not_eligible" ? (
                <span
                  className="font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full"
                  title={
                    a.therapist_payout_paid_at
                      ? "No refund — this session's payout was already settled (cancelled as an admin correction, not a late cancellation)"
                      : `No refund — cancelled within ${CANCELLATION_FULL_REFUND_HOURS} hours of the slot`
                  }
                >
                  No Refund
                </span>
              ) : (
                // refund_status === "failed" -- the refund attempt itself errored out
                // (see cancelAppointment.ts) and money is still owed. This used to fall
                // through to nothing, leaving a stuck refund visually identical to a
                // cancellation that never needed one -- the only place it was ever
                // surfaced was a one-time toast at the moment of cancellation, gone on
                // the very next page load.
                a.refund_status === "failed" && (
                  <span className="font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                    Refund Failed — Contact Us
                  </span>
                )
              )
            ) : a.payment_status === "unpaid" ? (
              <PayNowButton
                appointmentId={a.id}
                name={profile?.full_name ?? ""}
                email={profile?.email ?? ""}
                description={a.concern ?? "Virtual Physical Therapy Session"}
                amountPaise={
                  a.amount_paid_paise ??
                  (a.category_id ? categoryPriceMap.get(a.category_id) : undefined) ??
                  SESSION_FEE_PAISE
                }
              />
            ) : (
              <span className="font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full">
                Paid
              </span>
            )}
          </div>
        </div>

        {addressLines.length > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Your therapist is coming to
            </p>
            {addressLines.map((line: string) => (
              <p key={line} className="text-slate-700">
                {line}
              </p>
            ))}
            {visit?.visit_access_notes && (
              <p className="pt-1 text-slate-600">
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
                <i className="fa-solid fa-location-dot" /> View on map
              </a>
            )}
            {visit?.travel_fee_paise !== null && (visit?.travel_fee_paise ?? 0) > 0 && (
              <p className="pt-1 text-[11px] text-slate-400">
                Includes ₹{((visit?.travel_fee_paise ?? 0) / 100).toLocaleString("en-IN")} travel
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* A home visit has no Meet link to join -- the therapist is
              travelling to the address above. */}
          {visit?.visit_mode !== "home_visit" && (
            <JoinSessionButton
              meetLink={a.meet_link}
              slotTime={a.slot_time}
              status={a.status}
              durationMinutes={a.duration_minutes}
            />
          )}
          {(a.status === "requested" || a.status === "confirmed") && (
            <CancelSessionButton
              appointmentId={a.id}
              paid={a.payment_status === "paid"}
              slotTime={a.slot_time}
              refundWindowHours={
                visit?.visit_mode === "home_visit"
                  ? adminSettings.homeVisitCancellationRefundHours
                  : undefined
              }
            />
          )}
        </div>
        {a.status === "completed" && !a.no_show && (
          <SessionFeedbackForm
            appointmentId={a.id}
            role="patient"
            existingRating={a.patient_rating}
            existingFeedback={a.patient_feedback}
          />
        )}
      </div>
    );
  }
