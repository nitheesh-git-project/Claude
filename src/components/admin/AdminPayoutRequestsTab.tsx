import Link from "next/link";
import PagedList from "@/components/dashboard/PagedList";
import TherapistPayoutButton from "@/components/admin/TherapistPayoutButton";
import CompletePayoutRequestButton from "@/components/admin/CompletePayoutRequestButton";
import StartReviewPayoutRequestButton from "@/components/admin/StartReviewPayoutRequestButton";
import { formatRupees } from "@/lib/formatMoney";

function formatInr(paise: number) {
  return `₹${formatRupees(paise)}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

export type PayoutRequestRow = {
  id: string;
  therapistId: string;
  therapistName: string;
  therapistCode: string | null;
  requestedAmountPaise: number;
  requestedAt: string;
  status: "pending" | "reviewing" | "completed";
  completedAt: string | null;
  // Owed balance as of this page load -- see settle-therapist-payout's own
  // formula, reused by admin/dashboard/page.tsx to compute this per
  // therapist. Only meaningful for pending/reviewing rows.
  currentlyOwedPaise: number;
  /** Cash the therapist is holding from home-visit collections, netted off
   *  what Pay transfers (the same figure the Payouts table passes). */
  cashHeldPaise: number;
  /** Whether a revenue share is set. Without one nothing can be paid, and the
   *  row says so instead of offering a button that would refuse. */
  shareSet: boolean;
};

export default function AdminPayoutRequestsTab({
  requests,
  part = "both",
}: {
  requests: PayoutRequestRow[];
  /** The Payouts screen puts the open requests FIRST -- they are the work --
   *  then the balances table, then the history. "both" is the old shape. */
  part?: "open" | "completed" | "both";
}) {
  const pending = requests.filter((r) => r.status === "pending");
  const reviewing = requests.filter((r) => r.status === "reviewing");
  const open = [...pending, ...reviewing];
  const completed = requests.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      {part !== "completed" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Payout Requests
          {open.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {open.length}
            </span>
          )}
        </h2>
        <p className="text-[11px] text-slate-500 -mt-2 mb-4">
          Start Review to let the therapist know you&apos;re on it, Pay them from the row, then mark
          the request completed - that notifies the therapist.
        </p>
        {open.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No open requests.</p>
        ) : (
          <PagedList
            noun="request"
            storageKey="admin-payout-requests-open"
            className="space-y-3"
            filters={[
              { key: "pending", label: "Untouched" },
              { key: "reviewing", label: "In review" },
            ]}
            items={open.map((r) => ({
              id: r.id,
              group: r.status,
              node: (
              <div
                className="p-4 rounded-xl border border-slate-200 text-xs flex items-center justify-between flex-wrap gap-3"
              >
                <div>
                  <p className="font-bold text-slate-900 flex items-center gap-2">
                    <Link
                      href={`/admin/dashboard/therapists/${r.therapistId}`}
                      className="hover:text-teal-700 hover:underline transition"
                    >
                      {r.therapistName}
                    </Link>
                    {r.therapistCode && (
                      <span className="font-mono font-normal text-[11px] text-slate-500">
                        {r.therapistCode}
                      </span>
                    )}
                    {r.status === "reviewing" && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Reviewing
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Requested {formatInr(r.requestedAmountPaise)} on {formatDateTime(r.requestedAt)}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Currently owed (Payouts tab): {formatInr(r.currentlyOwedPaise)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* Pay is on the row: the request, the balance and the
                      transfer used to be on two screens' worth of scrolling. */}
                  {r.shareSet ? (
                    r.currentlyOwedPaise > 0 && (
                      <TherapistPayoutButton
                        therapistId={r.therapistId}
                        owedPaise={r.currentlyOwedPaise}
                        cashHeldPaise={r.cashHeldPaise}
                      />
                    )
                  ) : (
                    <Link
                      href={`/admin/dashboard/therapists/${r.therapistId}`}
                      className="text-teal-700 font-semibold hover:underline"
                    >
                      Set their share first
                    </Link>
                  )}
                  {r.status === "pending" ? (
                    <StartReviewPayoutRequestButton requestId={r.id} />
                  ) : (
                    <CompletePayoutRequestButton
                      requestId={r.id}
                      currentlyOwedPaise={r.currentlyOwedPaise}
                    />
                  )}
                </div>
              </div>
              ),
            }))}
          />
        )}
      </div>
      )}

      {part !== "open" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Completed Requests</h2>
        {completed.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No completed requests yet.</p>
        ) : (
          <PagedList
            noun="request"
            storageKey="admin-payout-requests-completed"
            className="space-y-3"
            items={completed.map((r) => ({
              id: r.id,
              node: (
              <div className="p-4 rounded-xl border border-slate-200 text-xs">
                <p className="font-bold text-slate-900">
                  <Link
                    href={`/admin/dashboard/therapists/${r.therapistId}`}
                    className="hover:text-teal-700 hover:underline transition"
                  >
                    {r.therapistName}
                  </Link>
                  {r.therapistCode && (
                    <span className="ml-2 font-mono font-normal text-[11px] text-slate-500">
                      {r.therapistCode}
                    </span>
                  )}
                </p>
                <p className="text-slate-500 mt-1">
                  Requested {formatInr(r.requestedAmountPaise)} on {formatDateTime(r.requestedAt)}
                  {r.completedAt && <> • Completed {formatDateTime(r.completedAt)}</>}
                </p>
              </div>
              ),
            }))}
          />
        )}
      </div>
      )}
    </div>
  );
}
