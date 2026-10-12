"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import AdminScreenLink from "@/components/admin/AdminScreenLink";
import type { AssignBlock } from "@/lib/therapistAssignability";
import { ROSTER_THERAPIST_VIEW_PREFIX } from "@/lib/rosterView";

const REASON_ICON: Record<AssignBlock["code"], string> = {
  on_leave: "fa-plane-departure",
  no_schedule: "fa-calendar-xmark",
  not_working_that_hour: "fa-clock",
  already_booked: "fa-calendar-check",
};

/**
 * "Unable to assign this therapist", with every reason the server gave
 * (src/lib/therapistAssignability.ts). Opened by the assign and edit forms
 * when a route answers `code: "therapist_unavailable"`.
 */
export default function TherapistUnavailableDialog({
  reasons,
  therapistId,
  onClose,
}: {
  reasons: AssignBlock[];
  /** The therapist the form tried, so the roster opens on their hours. */
  therapistId: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId, alert: true });
  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          {...dialogProps}
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <i className="fa-solid fa-user-slash" aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId} className="font-display text-base font-bold text-slate-900">
                Unable to assign this therapist
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {reasons.length === 1 ? "The reason:" : "The reasons:"}
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {reasons.map((reason) => (
              <li
                key={reason.code}
                className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              >
                <i className={`fa-solid ${REASON_ICON[reason.code]} mt-0.5 text-xs text-slate-500`} aria-hidden="true" />
                {reason.message}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Pick another therapist or time, or change their hours or leave on the roster first.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            {/* Switches screens in place (every admin screen is already
                rendered) and closes this dialog on the way. It used to be a
                plain Link to the same route: a full server render started
                behind the dialog and the drawer, so the tap read as dead
                while the page changed underneath. The drawer closes itself
                when its screen is left (SessionDetailDrawer). */}
            <AdminScreenLink
              href={rosterHref(therapistId)}
              onClick={onClose}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Open the roster
            </AdminScreenLink>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

/** The roster, opened on one therapist when we know which. The `view`
 *  preset is read by AdminRosterTab (see `ROSTER_THERAPIST_VIEW_PREFIX`). */
export function rosterHref(therapistId: string | null): string {
  const base = "/admin/dashboard?section=sessions&tab=roster";
  return therapistId
    ? `${base}&view=${encodeURIComponent(`${ROSTER_THERAPIST_VIEW_PREFIX}${therapistId}`)}`
    : base;
}

/** For a form: hand it a failed response's body (and the therapist it
 *  tried); it opens the dialog and returns true when that body was "this
 *  therapist is unavailable". */
export function useTherapistUnavailable(): {
  showIfUnavailable: (data: unknown, therapistId?: string | null) => boolean;
  dialog: ReactNode;
} {
  const [state, setState] = useState<{ reasons: AssignBlock[]; therapistId: string | null } | null>(
    null
  );
  const showIfUnavailable = useCallback((data: unknown, therapistId?: string | null) => {
    const body = data as { code?: string; reasons?: AssignBlock[] } | null;
    if (body?.code !== "therapist_unavailable" || !Array.isArray(body.reasons)) return false;
    setState({ reasons: body.reasons, therapistId: therapistId ?? null });
    return true;
  }, []);
  const dialog = state ? (
    <TherapistUnavailableDialog
      reasons={state.reasons}
      therapistId={state.therapistId}
      onClose={() => setState(null)}
    />
  ) : null;
  return { showIfUnavailable, dialog };
}
