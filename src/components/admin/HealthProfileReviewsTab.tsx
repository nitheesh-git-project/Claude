import Link from "next/link";
import ReadOnlyDeskNote from "@/components/admin/ReadOnlyDeskNote";
import ConditionRequestActions from "@/components/admin/ConditionRequestActions";
import ConditionAccessActions from "@/components/admin/ConditionAccessActions";
import { formatClinicDateTime } from "@/lib/formatDateTime";
import { isOverdue, waitingLabel } from "@/lib/healthProfileReviews";
import type { HealthProfileReviews } from "@/lib/healthProfileReviewsServer";

/**
 * Today -> Health Profile reviews: the two things that wait on a person in a
 * patient's Health Profile, each as a row you can act on.
 *
 * It exists because the Today figures for these ("Care intake submissions",
 * "Therapist access requests") linked to the patients directory, which listed
 * every patient and not the ones counted. Each row names the patient, the
 * therapist, and how long it has waited, and carries Approve / Decline on the
 * row. The decision routes are the ones the patient's own screen uses
 * (/api/admin/condition-requests/decide, /condition-access/decide), both
 * `requireAdminScope("people")`: a desk that can only read People sees the
 * rows and no buttons, and is told who can act.
 *
 * Server-rendered, so "waiting 4 days" is computed once against the request's
 * own clock rather than twice (server and browser) with two answers.
 */
export default function HealthProfileReviewsTab({
  reviews,
  canManage,
  nowMs,
}: {
  reviews: HealthProfileReviews;
  canManage: boolean;
  nowMs: number;
}) {
  const { submissions, access } = reviews;
  return (
    <div className="space-y-6" data-testid="health-profile-reviews">
      {!canManage && <ReadOnlyDeskNote />}

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1 flex items-center gap-2">
          Answers waiting to go live
          {submissions.status === "ok" && submissions.rows.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {submissions.rows.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Approving puts the answers live on the patient&apos;s Health Profile straight away.
        </p>
        {submissions.status === "unreadable" ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Couldn&apos;t load the answers waiting for review - reload the page to try again.
          </p>
        ) : submissions.rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No answers are waiting for review.</p>
        ) : (
          <ul className="space-y-3">
            {submissions.rows.map((r) => (
              <li
                key={r.id}
                data-testid="health-review-submission"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">
                    <Link
                      href={`/admin/dashboard/conditions/${r.patientId}`}
                      className="hover:text-teal-700 hover:underline"
                    >
                      {r.patientName}
                    </Link>
                  </p>
                  <p className="text-slate-600">Filled in by {r.submitterName}</p>
                  <p className="text-slate-500">
                    {formatClinicDateTime(r.submittedAt)} -{" "}
                    <span className={isOverdue(r.submittedAt, nowMs) ? "font-bold text-red-700" : ""}>
                      {waitingLabel(r.submittedAt, nowMs)}
                    </span>
                  </p>
                </div>
                {canManage ? (
                  <ConditionRequestActions requestId={r.id} patientName={r.patientName} />
                ) : (
                  <p className="text-[11px] font-semibold text-amber-800">Waiting for a decision</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-1 flex items-center gap-2">
          Therapists asking to edit a Health Profile
          {access.status === "ok" && access.rows.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {access.rows.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Approving lets the therapist add to that patient&apos;s Health Profile. Only one therapist can edit a
          profile at a time, so any other therapist who can edit it loses that.
        </p>
        {access.status === "unreadable" ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Couldn&apos;t load the therapist access requests - reload the page to try again.
          </p>
        ) : access.rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No therapist is waiting for access.</p>
        ) : (
          <ul className="space-y-3">
            {access.rows.map((g) => (
              <li
                key={g.id}
                data-testid="health-review-access"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">
                    {g.therapistName}{" "}
                    <span className="font-normal text-slate-500">wants to edit</span>{" "}
                    <Link
                      href={`/admin/dashboard/conditions/${g.patientId}`}
                      className="hover:text-teal-700 hover:underline"
                    >
                      {g.patientName}&apos;s Health Profile
                    </Link>
                  </p>
                  <p className="text-slate-500">
                    Asked {formatClinicDateTime(g.requestedAt)} -{" "}
                    <span className={isOverdue(g.requestedAt, nowMs) ? "font-bold text-red-700" : ""}>
                      {waitingLabel(g.requestedAt, nowMs)}
                    </span>
                  </p>
                </div>
                {canManage ? (
                  <ConditionAccessActions
                    grantId={g.id}
                    status="requested"
                    therapistName={g.therapistName}
                    patientName={g.patientName}
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-amber-800">Waiting for a decision</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviews.namesFailed && (
        <p className="text-[11px] text-slate-500">
          Some names couldn&apos;t load, so those rows say &quot;A patient&quot; or &quot;A therapist&quot;. Reload to try again.
        </p>
      )}
    </div>
  );
}
