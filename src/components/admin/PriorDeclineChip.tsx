import { formatClinicDate } from "@/lib/formatDateTime";
import { declineReasonLabel, type DeclinedApplication } from "@/lib/declineReasons";

// "Declined before" on an Approvals row or a B2B lead: the same email or
// phone was turned away earlier (findPriorDecline). A declined signup's
// account is deleted, so without this a returning applicant looks brand new
// and the reason they were declined is not in front of whoever decides now.
export default function PriorDeclineChip({ decline }: { decline: DeclinedApplication }) {
  return (
    <p
      data-testid="prior-decline"
      className="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
    >
      <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
      <span className="font-semibold">Declined before</span>
      <span>
        {formatClinicDate(decline.declined_at)} - {declineReasonLabel(decline.reason_code)}
        {decline.reason_note ? ` ("${decline.reason_note}")` : ""}
      </span>
    </p>
  );
}
