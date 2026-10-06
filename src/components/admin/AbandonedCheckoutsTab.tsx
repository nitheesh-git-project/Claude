import PagedList from "@/components/dashboard/PagedList";
import { formatClinicDate, formatClinicDateTime } from "@/lib/formatDateTime";

/** One row of abandoned_booking_accounts() (schema.sql). */
export type AbandonedCheckoutRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  tries: number;
  next_slot: string | null;
  next_concern: string | null;
};

// People -> Abandoned checkouts: people who signed up inside a booking
// wizard and have not paid. Their account is locked until a payment lands or
// their payment tries run out, and is deleted after `deleteAfterDays` if
// neither happens (purge_abandoned_booking_accounts, run by the maintenance
// sweep). Read-only on purpose: these are leads to call, not approvals --
// approving one would hand a dashboard to somebody who has not paid.
export default function AbandonedCheckoutsTab({
  rows,
  deleteAfterDays,
  tryLimit,
}: {
  /** `null` when the list could not be read -- said, never shown as empty. */
  rows: AbandonedCheckoutRow[] | null;
  deleteAfterDays: number;
  tryLimit: number;
}) {
  return (
    <section
      aria-label="Abandoned checkouts"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <h2 className="font-display font-bold text-lg text-slate-800">Abandoned checkouts</h2>
      <p className="mt-1 mb-4 max-w-2xl text-xs leading-relaxed text-slate-500">
        People who signed up while booking and haven&apos;t paid. Their account stays locked
        until they pay or use up {tryLimit} payment {tryLimit === 1 ? "try" : "tries"}, and is
        removed after {deleteAfterDays} {deleteAfterDays === 1 ? "day" : "days"} if neither
        happens. Worth a call - they wanted a session.
      </p>
      {rows === null ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          This list couldn&apos;t be loaded just now. Refresh to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No abandoned checkouts. Everyone who started a booking has paid.
        </p>
      ) : (
        <PagedList
          noun="checkout"
          storageKey="admin-abandoned-checkouts"
          className="space-y-3"
          items={rows.map((row) => ({
            id: row.id,
            node: <AbandonedCheckoutCard row={row} deleteAfterDays={deleteAfterDays} tryLimit={tryLimit} />,
          }))}
        />
      )}
    </section>
  );
}

function AbandonedCheckoutCard({
  row,
  deleteAfterDays,
  tryLimit,
}: {
  row: AbandonedCheckoutRow;
  deleteAfterDays: number;
  tryLimit: number;
}) {
  const removedOn = new Date(new Date(row.created_at).getTime() + deleteAfterDays * 86_400_000);
  return (
    <div className="p-4 rounded-xl border border-slate-200 text-xs space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold text-slate-900">{row.full_name?.trim() || "No name given"}</p>
          <p className="text-slate-500 mt-0.5">Signed up {formatClinicDateTime(row.created_at)}</p>
        </div>
        <span className="font-semibold px-3 py-1 rounded-full text-amber-700 bg-amber-100">
          {row.tries} of {tryLimit} payment {tryLimit === 1 ? "try" : "tries"}
        </span>
      </div>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
        <dt className="font-semibold text-slate-500">Email</dt>
        <dd className="text-slate-800 break-all">
          {row.email ? (
            <a href={`mailto:${row.email}`} className="text-teal-700 hover:underline">
              {row.email}
            </a>
          ) : (
            "-"
          )}
        </dd>
        <dt className="font-semibold text-slate-500">Phone</dt>
        <dd className="text-slate-800">
          {row.phone ? (
            <a href={`tel:${row.phone}`} className="text-teal-700 hover:underline">
              {row.phone}
            </a>
          ) : (
            "-"
          )}
        </dd>
        <dt className="font-semibold text-slate-500">Wanted</dt>
        <dd className="text-slate-800">
          {row.next_slot
            ? `${row.next_concern ?? "A session"} on ${formatClinicDateTime(row.next_slot)}`
            : "No booking held"}
        </dd>
        <dt className="font-semibold text-slate-500">Removed on</dt>
        <dd className="text-slate-800">{formatClinicDate(removedOn)}, if still unpaid</dd>
      </dl>
    </div>
  );
}
