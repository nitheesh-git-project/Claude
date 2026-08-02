import Link from "next/link";
import CompletePayoutRequestButton from "@/components/admin/CompletePayoutRequestButton";

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
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
  status: "pending" | "completed";
  completedAt: string | null;
  // Owed balance as of this page load -- see settle-therapist-payout's own
  // formula, reused by admin/dashboard/page.tsx to compute this per
  // therapist. Only meaningful for pending rows.
  currentlyOwedPaise: number;
};

export default function AdminPayoutRequestsTab({ requests }: { requests: PayoutRequestRow[] }) {
  const pending = requests.filter((r) => r.status === "pending");
  const completed = requests.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Pending Payout Requests
          {pending.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {pending.length}
            </span>
          )}
        </h2>
        <p className="text-[11px] text-slate-400 -mt-2 mb-4">
          Pay the therapist via the Payouts tab first, then mark the request completed here — that
          notifies the therapist.
        </p>
        {pending.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No pending requests.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li
                key={r.id}
                className="p-4 rounded-xl border border-slate-200 text-xs flex items-center justify-between flex-wrap gap-3"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    <Link
                      href={`/admin/dashboard/therapists/${r.therapistId}`}
                      className="hover:text-teal-700 hover:underline transition"
                    >
                      {r.therapistName}
                    </Link>
                    {r.therapistCode && (
                      <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
                        {r.therapistCode}
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Requested {formatInr(r.requestedAmountPaise)} on {formatDateTime(r.requestedAt)}
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    Currently owed (Payouts tab): {formatInr(r.currentlyOwedPaise)}
                  </p>
                </div>
                <CompletePayoutRequestButton
                  requestId={r.id}
                  currentlyOwedPaise={r.currentlyOwedPaise}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-bold text-lg text-slate-800 mb-4">Completed Requests</h2>
        {completed.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No completed requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {completed.map((r) => (
              <li key={r.id} className="p-4 rounded-xl border border-slate-200 text-xs">
                <p className="font-bold text-slate-900">
                  <Link
                    href={`/admin/dashboard/therapists/${r.therapistId}`}
                    className="hover:text-teal-700 hover:underline transition"
                  >
                    {r.therapistName}
                  </Link>
                  {r.therapistCode && (
                    <span className="ml-2 font-mono font-normal text-[11px] text-slate-400">
                      {r.therapistCode}
                    </span>
                  )}
                </p>
                <p className="text-slate-500 mt-1">
                  Requested {formatInr(r.requestedAmountPaise)} on {formatDateTime(r.requestedAt)}
                  {r.completedAt && <> • Completed {formatDateTime(r.completedAt)}</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
