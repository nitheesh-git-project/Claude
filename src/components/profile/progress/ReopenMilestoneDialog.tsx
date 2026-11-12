"use client";

import { useId, useRef, useState } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import Spinner from "@/components/system/Spinner";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { REOPEN_REASON_MAX, REOPEN_REASON_MIN } from "@/lib/careGoals";
import { NETWORK_ERROR_MESSAGE, progressErrorMessage, readProgressFailure } from "@/lib/progressErrors";

/**
 * An admin reopens a milestone that was marked reached by mistake
 * (/api/admin/care-milestones/reopen). "Reached" is the one fact on a
 * milestone, so this never edits it: the route writes an append-only event
 * with the reason and moves the milestone back to working or planned. The
 * reason is required (at least REOPEN_REASON_MIN characters) because it is
 * read later by someone asking why a patient's milestone went backwards.
 *
 * The parent mounts this only for a viewer whose scope can call the route
 * (`scopeCanManage(scope, "people")`, like the other admin writes to a
 * patient's clinical record), so the control is absent - not disabled - for
 * everyone else; a 403 that still arrives is said as a sentence.
 *
 * Validity gate, not a wait: the button is off only while the reason is too
 * short, and while its own request is in flight.
 */
export default function ReopenMilestoneDialog({
  patientId,
  milestoneId,
  milestoneTitle,
  onClose,
}: {
  patientId: string;
  milestoneId: string;
  milestoneTitle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [reason, setReason] = useState("");
  const [reopenTo, setReopenTo] = useState<"working" | "planned">("working");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const titleId = useId();
  const reasonId = useId();
  const toId = useId();

  const trimmed = reason.replace(/\s+/g, " ").trim();
  const tooShort = trimmed.length < REOPEN_REASON_MIN;

  const { panelRef, dialogProps } = useDialogChrome({
    onClose: () => {
      if (!savingRef.current) onClose();
    },
    labelledBy: titleId,
  });

  async function submit() {
    if (savingRef.current || tooShort) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/care-milestones/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, milestoneId, reason: trimmed, reopenTo }),
      });
      if (!res.ok) {
        setError(progressErrorMessage(await readProgressFailure(res), "reopen"));
        return;
      }
      show(`"${milestoneTitle}" is back to ${reopenTo === "working" ? "working on it" : "planned"}`);
      onClose();
      router.refresh();
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          ref={panelRef}
          {...dialogProps}
          className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
        >
          <div className="border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <h2 id={titleId} className="font-display text-lg font-bold text-slate-900">
              Reopen this milestone
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 [overflow-wrap:anywhere]">{milestoneTitle}</p>
          </div>

          <form
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              A reached milestone is never edited. Reopening keeps a permanent record of when it was reached, the
              measurement that showed it, who reopened it and why. The patient will see it as not yet reached.
            </p>

            <div>
              <label htmlFor={toId} className="block text-sm font-semibold text-slate-800">
                Move it back to
              </label>
              <select
                id={toId}
                value={reopenTo}
                onChange={(e) => setReopenTo(e.target.value === "planned" ? "planned" : "working")}
                className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                <option value="working">Working on it</option>
                <option value="planned">Planned</option>
              </select>
            </div>

            <div>
              <label htmlFor={reasonId} className="block text-sm font-semibold text-slate-800">
                Why is it being reopened?
              </label>
              <textarea
                id={reasonId}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError(null);
                }}
                rows={4}
                maxLength={REOPEN_REASON_MAX}
                aria-describedby={`${reasonId}-hint`}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              />
              <p id={`${reasonId}-hint`} className="mt-1 text-xs text-slate-600">
                {tooShort
                  ? `At least ${REOPEN_REASON_MIN} characters (${trimmed.length} so far).`
                  : `${trimmed.length} of ${REOPEN_REASON_MAX} characters.`}
              </p>
            </div>

            {error && (
              <p role="alert" data-form-error className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
          </form>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-700 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || tooShort}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {saving && <Spinner />}
              {saving ? "Reopening…" : "Reopen milestone"}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
