import Link from "next/link";
import CompletePayoutRequestButton from "@/components/admin/CompletePayoutRequestButton";
import StartReviewPayoutRequestButton from "@/components/admin/StartReviewPayoutRequestButton";

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
  status: "pending" | "reviewing" | "completed";
  completedAt: string | null;
  // Owed balance as of this page load -- see settle-therapist-payout's own
  // formula, reused by admin/dashboard/page.tsx to compute this per
  // therapist. Only meaningful for pending/reviewing rows.
  currentlyOwedPaise: number;
};

export default function AdminPayoutRequestsTab({ requests }: { requests: PayoutRequestRow[] }) {
  const pending = requests.filter((r) => r.status === "pending");
  const reviewing = requests.filter((r) => r.status === "reviewing");
  const open = [...pending, ...reviewing];
  const completed = requests.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          Payout Requests
          {open.length > 0 && (
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
              {open.length}
            </span>
          )}
        </h2>
        <p className="text-[11px] text-slate-400 -mt-2 mb-4">
          Start Review to let the therapist know you&apos;re on it, pay them via the Payouts tab,
          then mark the request completed here — that notifies the therapist.
        </p>
        {open.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No open requests.</p>
        ) : (
          <ul className="space-y-3">
            {open.map((r) => (
              <li
                key={r.id}
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
                      <span className="font-mono font-normal text-[11px] text-slate-400">
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
                  <p className="text-slate-400 mt-0.5">
                    Currently owed (Payouts tab): {formatInr(r.currentlyOwedPaise)}
                  </p>
                </div>
                {r.status === "pending" ? (
                  <StartReviewPayoutRequestButton requestId={r.id} />
                ) : (
                  <CompletePayoutRequestButton
                    requestId={r.id}
                    currentlyOwedPaise={r.currentlyOwedPaise}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-display font-bold text-lg text-slate-800 mb-4">Completed Requests</h2>
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
