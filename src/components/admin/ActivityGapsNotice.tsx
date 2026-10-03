import { formatClinicDateTime } from "@/lib/formatDateTime";

export type ActivityGap = {
  id: string;
  actorName: string;
  action: string;
  targetLabel: string | null;
  createdAt: string;
};

/**
 * Admin actions the activity log could not record, at the top of the
 * history they are missing from.
 *
 * recordAdminActivity retries a failed write once and then keeps the entry
 * in admin_activity_gaps. Without this notice the history below still read
 * as complete -- the one screen whose whole job is to say who did what,
 * silently not saying it. Shown to every reader of either activity screen:
 * a gap is a fact about the log, not a finding about a colleague.
 */
export default function ActivityGapsNotice({
  gaps,
  total,
}: {
  gaps: ActivityGap[];
  /** All gaps in the last 30 days; `gaps` holds the newest of them. */
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      <p className="font-semibold">
        {total === 1
          ? "1 admin action in the last 30 days is missing from this history."
          : `${total} admin actions in the last 30 days are missing from this history.`}
      </p>
      <p className="mt-1">
        They went through, but the log couldn&apos;t record them. This is what is known about each:
      </p>
      <ul className="mt-2 space-y-1">
        {gaps.map((g) => (
          <li key={g.id}>
            <span className="font-semibold">{g.actorName}</span> - {g.action}
            {g.targetLabel ? ` (${g.targetLabel})` : ""}, {formatClinicDateTime(g.createdAt)}
          </li>
        ))}
      </ul>
      {total > gaps.length && (
        <p className="mt-2">and {total - gaps.length} older ones not listed here.</p>
      )}
    </div>
  );
}
