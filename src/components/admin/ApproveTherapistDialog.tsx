"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import { specialtyLabel } from "@/lib/therapistSpecialties";
import { APPROVAL_NOTE_MAX_LENGTH, parseSharePercent } from "@/lib/therapistApproval";

export type ApproveTherapistSummary = {
  name: string;
  email?: string | null;
  credentials?: string | null;
  specialization?: string | null;
};

/**
 * Approving a therapist, with what they need to be paid set in the same step.
 *
 * Approve used to be one tap, and the revenue share was a second visit to the
 * profile that was easy to forget -- the readiness panel flagged the gap, but
 * only once someone opened the profile. This dialog asks for it up front; the
 * route writes it in the same update as `approved` (src/lib/therapistApproval.ts
 * has the rules). An admin without the Money desk approves without it and is
 * told who sets it.
 *
 * It ends on what is still left -- working hours -- because those are a
 * roster of their own and do not fit here, and an approved therapist with no
 * hours can be offered nothing.
 */
export default function ApproveTherapistDialog({
  userId,
  therapist,
  canSetRevenueShare,
  homeVisitEnabled,
  canOpenRoster,
  onClose,
  onApproved,
}: {
  userId: string;
  therapist: ApproveTherapistSummary;
  canSetRevenueShare: boolean;
  homeVisitEnabled: boolean;
  canOpenRoster: boolean;
  /** Closed without approving. */
  onClose: () => void;
  /** Closed after a successful approval -- the caller refreshes. */
  onApproved: () => void;
}) {
  const titleId = useId();
  const shareId = useId();
  const homeShareId = useId();
  const noteId = useId();
  const shareRef = useRef<HTMLInputElement>(null);

  const [share, setShare] = useState("");
  const [sameForHomeVisits, setSameForHomeVisits] = useState(true);
  const [homeShare, setHomeShare] = useState("");
  const [visibleOnTeam, setVisibleOnTeam] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [isPending, startTransition] = useTransition();
  useUnloadWarning(isPending);

  const close = approved ? onApproved : onClose;
  const { panelRef, dialogProps } = useDialogChrome({ onClose: close, labelledBy: titleId });

  const shareValue = parseSharePercent(share);
  const specialty = specialtyLabel(therapist.specialization ?? null);

  function handleApprove() {
    setError(null);
    setShareError(null);
    if (canSetRevenueShare) {
      if (shareValue === null) {
        setShareError(
          share.trim() === ""
            ? "Enter their revenue share - their pay is worked out from it."
            : "Enter a number from 0 to 100."
        );
        shareRef.current?.focus();
        return;
      }
      if (homeVisitEnabled && !sameForHomeVisits && parseSharePercent(homeShare) === null) {
        setShareError("Enter the home-visit share from 0 to 100, or tick \"Same rate\".");
        return;
      }
    }
    startTransition(async () => {
      const res = await fetch("/api/admin/approve-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          therapistSetup: {
            ...(canSetRevenueShare
              ? {
                  revenueSharePercent: shareValue,
                  homeVisitSharePercent:
                    homeVisitEnabled && !sameForHomeVisits ? parseSharePercent(homeShare) : null,
                }
              : {}),
            visibleOnTeam,
            note: note.trim() || null,
          },
        }),
        keepalive: true,
      });
      if (res.ok) {
        setApproved(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not approve. Please try again.");
      }
    });
  }

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        onClick={isPending ? undefined : close}
      >
        <div
          ref={panelRef}
          {...dialogProps}
          className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl text-left"
          onClick={(e) => e.stopPropagation()}
        >
          {approved ? (
            <div data-testid="approve-therapist-done">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <i className="fa-solid fa-circle-check" aria-hidden="true" />
                </span>
                <div>
                  <h2 id={titleId} className="font-display text-base font-bold text-slate-900">
                    {therapist.name} is approved
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">They can sign in now.</p>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">One step left: working hours</p>
                <p className="mt-1 text-amber-800">
                  Until they have hours on the roster, nothing can offer them a session.
                  {!canSetRevenueShare &&
                    " A finance admin also needs to set their revenue share before sessions are handed to them automatically."}
                </p>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onApproved}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Done
                </button>
                {canOpenRoster && (
                  <Link
                    href="/admin/dashboard?section=sessions&tab=roster"
                    onClick={onApproved}
                    className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                  >
                    Set working hours
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 id={titleId} className="font-display text-base font-bold text-slate-900">
                Approve {therapist.name}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Check their details and set them up - they can sign in once approved.
              </p>

              <dl className="mt-4 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Credentials</dt>
                  <dd className="text-slate-800">{therapist.credentials?.trim() || "Not given"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-slate-500">Specialisation</dt>
                  <dd className="text-slate-800">{specialty ?? "Not given"}</dd>
                </div>
                {therapist.email && (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-slate-500">Email</dt>
                    <dd className="text-slate-800 break-all">{therapist.email}</dd>
                  </div>
                )}
              </dl>

              <fieldset className="mt-5">
                <legend className="text-xs font-bold text-slate-800">Revenue share</legend>
                {canSetRevenueShare ? (
                  <div className="mt-2 space-y-3 text-xs">
                    <div>
                      <label htmlFor={shareId} className="block font-semibold text-slate-700 mb-1">
                        {"Therapist's share of each session fee "}
                        <span className="text-red-600">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            ref={shareRef}
                            id={shareId}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step="0.01"
                            value={share}
                            onChange={(e) => {
                              setShare(e.target.value);
                              setShareError(null);
                            }}
                            aria-invalid={shareError ? true : undefined}
                            aria-describedby={`${shareId}-hint`}
                            className="w-28 rounded-lg border border-slate-300 p-2 pr-7"
                            placeholder="e.g. 60"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                            %
                          </span>
                        </div>
                        <p id={`${shareId}-hint`} className="text-slate-500">
                          {shareValue !== null
                            ? `Clinic keeps ${Math.round((100 - shareValue) * 100) / 100}%`
                            : "0 to 100"}
                        </p>
                      </div>
                    </div>
                    {homeVisitEnabled && (
                      <div>
                        <label className="flex items-center gap-2 text-slate-700">
                          <input
                            type="checkbox"
                            checked={sameForHomeVisits}
                            onChange={(e) => {
                              setSameForHomeVisits(e.target.checked);
                              setShareError(null);
                            }}
                            className="h-4 w-4 accent-teal-700"
                          />
                          Same rate for home visits
                        </label>
                        {!sameForHomeVisits && (
                          <div className="mt-2 pl-6">
                            <label htmlFor={homeShareId} className="block font-semibold text-slate-700 mb-1">
                              Home-visit share
                            </label>
                            <div className="relative w-28">
                              <input
                                id={homeShareId}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={100}
                                step="0.01"
                                value={homeShare}
                                onChange={(e) => {
                                  setHomeShare(e.target.value);
                                  setShareError(null);
                                }}
                                className="w-28 rounded-lg border border-slate-300 p-2 pr-7"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                %
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Travel is reimbursed in full on top of this.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {shareError && (
                      <p role="alert" className="text-red-600">
                        {shareError}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {"A finance admin sets their revenue share. You can approve now - until it is set, sessions won't be handed to them automatically."}
                  </p>
                )}
              </fieldset>

              <label className="mt-5 flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={visibleOnTeam}
                  onChange={(e) => setVisibleOnTeam(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-teal-700"
                />
                <span>
                  <span className="font-semibold">Show on the Our Team page</span>
                  <span className="block text-slate-500">Patients see their profile on /team.</span>
                </span>
              </label>

              <div className="mt-5 text-xs">
                <label htmlFor={noteId} className="block font-semibold text-slate-700 mb-1">
                  Internal note <span className="font-normal text-slate-500">(optional, admins only)</span>
                </label>
                <textarea
                  id={noteId}
                  rows={2}
                  maxLength={APPROVAL_NOTE_MAX_LENGTH}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Licence verified on call"
                  className="w-full rounded-lg border border-slate-300 p-2"
                />
              </div>

              {error && (
                <p role="alert" className="mt-3 text-xs text-red-600">
                  {error}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isPending}
                  className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                >
                  {isPending ? "Approving…" : "Approve therapist"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}
