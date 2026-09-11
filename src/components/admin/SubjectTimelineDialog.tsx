"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import Spinner from "@/components/system/Spinner";
import type { ActivityRow } from "@/components/admin/AdminActivityLogTab";
import { describeAction, formatWhen } from "@/components/admin/ActivityDetailDialog";
import { activityCategory, activityCategoryLabel } from "@/lib/activityLog";

// Everything the back office did to one subject, oldest at the bottom.
//
// The log answers "what did Asha do" well and "what happened to this
// patient" badly: the second question is the one asked when somebody
// complains, and answering it meant searching a name, reading the results,
// and hoping nothing older than the loaded page mattered. This fetches by
// `target_id` instead, so it is that subject's whole history rather than
// whatever the current page happened to hold.
//
// Two things it deliberately does not do. It does not match on the label --
// that is a snapshot taken at write time, and a patient renamed between two
// entries would have their history split in half. And it does not claim to
// be complete beyond the log: an action recorded with no `target_id`, or one
// naming this subject only inside `details`, is not here, which is why the
// footer says what the list is keyed on rather than calling it everything.

export default function SubjectTimelineDialog({
  subject,
  onClose,
  onOpenEntry,
}: {
  /** The entry the reader came from -- its subject is what is being traced. */
  subject: ActivityRow;
  onClose: () => void;
  /** Back into the detail dialog for one row of the timeline. */
  onOpenEntry: (row: ActivityRow) => void;
}) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/activity-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId: subject.targetId }),
        });
        const body = (await res.json()) as { rows?: ActivityRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Could not read this subject's history.");
          return;
        }
        setRows(body.rows ?? []);
      } catch {
        if (!cancelled) setError("Could not reach the server. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject.targetId]);

  return (
    <Modal
      title={subject.targetLabel ?? "This subject"}
      subtitle="Everything the back office has done to this record"
      onClose={onClose}
    >
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          {error}
        </p>
      )}

      {!rows && !error && (
        <p className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Spinner /> Reading the log…
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="py-4 text-xs text-slate-500">
          Nothing else has been recorded against this record.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenEntry(r)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                  r.id === subject.id
                    ? "border-teal-300 bg-teal-50/60"
                    : "border-slate-200 bg-white"
                }`}
              >
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-800">
                  {describeAction(r.action)}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    {activityCategoryLabel(activityCategory(r.action))}
                  </span>
                  {/* Where the reader came in. Without it a long timeline
                      loses the entry they were reading a moment ago. */}
                  {r.id === subject.id && (
                    <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-700">
                      This entry
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {r.actorName} · {formatWhen(r.createdAt)}
                  {r.amountPaise != null && (
                    <> · ₹{(r.amountPaise / 100).toLocaleString("en-IN")}</>
                  )}
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
        Entries recorded against this exact record, newest first. An action that
        named no record, or named this one only inside its details, is not listed
        here.
      </p>
    </Modal>
  );
}
