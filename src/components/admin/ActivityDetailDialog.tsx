"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { ADMIN_ACTIVITY_LABELS } from "@/lib/adminActivityLog";
import { isFirstValue, readableDetails } from "@/lib/activityDetails";
import { MIN_RETENTION_DAYS } from "@/lib/activityLog";
import type { ActivityRow } from "@/components/admin/AdminActivityLogTab";

/** How an entry's timestamp reads, everywhere one is shown. */
export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** How an action reads. Falls through to the stored key rather than hiding
 *  an action nobody has named yet -- an unlabelled row is still evidence. */
export function describeAction(action: string) {
  return ADMIN_ACTIVITY_LABELS[action as keyof typeof ADMIN_ACTIVITY_LABELS] ?? action;
}

// One entry, in full.
//
// The table answers "who did what"; this answers "what exactly changed, from
// what". It used to be the route's raw JSON printed into the cell -- a
// developer's view of a record whose whole purpose is to be read months
// later by somebody asking what a colleague altered.
//
// Three things it must not do. It must not drop a field it does not
// recognise: an unfamiliar key is exactly the one somebody is looking for,
// so anything unpaired is listed plainly and the raw record stays available
// underneath. It must not claim a change it cannot show -- an entry whose
// route recorded nothing says so rather than rendering an empty table. And
// it must not imply the entry can be edited: nothing here is a control,
// because admin_activity_log has no update policy and never should.
export default function ActivityDetailDialog({
  row,
  onClose,
}: {
  row: ActivityRow;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const { changes, facts } = readableDetails(row.details);
  const hasDetails = !!row.details && Object.keys(row.details).length > 0;

  return (
    <Modal
      title={describeAction(row.action)}
      subtitle={`${row.actorName} · ${formatWhen(row.createdAt)}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact label="Admin" value={row.actorName} />
          <Fact label="When" value={formatWhen(row.createdAt)} />
          <Fact label="Subject" value={row.targetLabel ?? "—"} />
          <Fact
            label="Amount"
            value={
              row.amountPaise != null
                ? `₹${(row.amountPaise / 100).toLocaleString("en-IN")}`
                : "—"
            }
          />
        </dl>

        {changes.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              What changed
            </p>
            <div className="mt-2 space-y-2">
              {changes.map((change) => (
                <div
                  key={change.label}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                >
                  <p className="text-[11px] font-semibold text-slate-500">{change.label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {isFirstValue(change) ? (
                      <span className="text-slate-400">Not set before</span>
                    ) : (
                      <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700 line-through decoration-red-300">
                        {change.from}
                      </span>
                    )}
                    <i aria-hidden className="fa-solid fa-arrow-right text-[9px] text-slate-300" />
                    <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                      {change.to}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {facts.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {changes.length > 0 ? "Also recorded" : "What was recorded"}
            </p>
            <dl className="mt-2 space-y-1.5">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="grid grid-cols-1 gap-0.5 sm:grid-cols-[160px_1fr] sm:gap-3"
                >
                  <dt className="text-[11px] font-semibold text-slate-500">{fact.label}</dt>
                  <dd className="break-words text-xs text-slate-800">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {!hasDetails && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            This action recorded no further detail — who, what and when is the
            whole entry. A plain approval is the usual case: its evidence is
            the name and the timestamp above.
          </p>
        )}

        <div className="border-t border-slate-200 pt-3">
          {hasDetails && (
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-700"
            >
              {showRaw ? "Hide" : "Show"} the exact record
            </button>
          )}
          {showRaw && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-[10px] text-slate-600">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            {/* Said on the screen rather than only in the schema: a reader
                weighing an entry needs to know it cannot have been edited.
                The second sentence is the honest half -- entries older than
                the protected window can be cleared, so claiming they never
                go would be a promise this app stopped keeping the day the
                Logs section got its cutoff. */}
            This entry cannot be edited by anyone, including the admin who
            wrote it. After {MIN_RETENTION_DAYS} days a Master Admin can
            clear it, and that clearing is logged too.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
