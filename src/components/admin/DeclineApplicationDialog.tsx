"use client";

import { useId, useRef, useState, useTransition } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import {
  DECLINE_NOTE_MAX_LENGTH,
  DECLINE_NOTE_MIN_FOR_OTHER,
  DECLINE_REASON_LABELS,
  DECLINE_REASONS_BY_KIND,
  parseDeclineReason,
  type DeclineKind,
  type DeclineReasonCode,
} from "@/lib/declineReasons";

/**
 * Declining an application, with the reason it was declined.
 *
 * Decline used to be a bare "are you sure?", and the person then vanished:
 * a signup's account is deleted, and nothing said why or that it had ever
 * existed. This asks for a reason (chips, with a note -- required only for
 * "Other"; src/lib/declineReasons.ts has the rules) and the route records
 * the applicant on People -> Declined in the same step as the decline.
 */
export default function DeclineApplicationDialog({
  kind,
  name,
  endpoint,
  body,
  onClose,
  onDeclined,
}: {
  kind: DeclineKind;
  name: string;
  endpoint: string;
  /** The request body besides the reason -- the id the route acts on. */
  body: Record<string, unknown>;
  onClose: () => void;
  /** Called after a successful decline -- the caller refreshes. */
  onDeclined: () => void;
}) {
  const titleId = useId();
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [reasonCode, setReasonCode] = useState<DeclineReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  useUnloadWarning(isPending);
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId });

  const isOther = reasonCode === "other";
  const consequence =
    kind === "hospital"
      ? "The inquiry is marked declined."
      : "Their account is deleted. They can apply again from scratch.";

  function handleDecline() {
    setError(null);
    const parsed = parseDeclineReason(kind, { reasonCode, note });
    if (!parsed.ok) {
      setError(parsed.error);
      if (reasonCode) noteRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, reasonCode: parsed.reasonCode, note: parsed.note }),
        keepalive: true,
      });
      if (res.ok) {
        onDeclined();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not decline. Please try again.");
      }
    });
  }

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        onClick={isPending ? undefined : onClose}
      >
        <div
          ref={panelRef}
          {...dialogProps}
          data-testid="decline-application-dialog"
          className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="font-display text-base font-bold text-slate-900">
            Decline {name}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {consequence} The reason is kept on People {"→"} Declined so nothing is missed.
          </p>

          <fieldset className="mt-5">
            <legend className="text-xs font-bold text-slate-800">
              Reason <span className="text-red-600">*</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DECLINE_REASONS_BY_KIND[kind].map((code) => {
                const selected = reasonCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setReasonCode(code);
                      setError(null);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "border-red-600 bg-red-50 text-red-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {DECLINE_REASON_LABELS[code]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 text-xs">
            <label htmlFor={noteId} className="block font-semibold text-slate-700 mb-1">
              {isOther ? (
                <>
                  What happened <span className="text-red-600">*</span>
                </>
              ) : (
                <>
                  Note <span className="font-normal text-slate-500">(optional, admins only)</span>
                </>
              )}
            </label>
            <textarea
              ref={noteRef}
              id={noteId}
              rows={3}
              maxLength={DECLINE_NOTE_MAX_LENGTH}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              placeholder={
                isOther
                  ? `At least ${DECLINE_NOTE_MIN_FOR_OTHER} characters`
                  : kind === "therapist"
                    ? "e.g. Licence number didn't match the council register"
                    : "e.g. Called twice, no answer"
              }
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
              onClick={handleDecline}
              disabled={isPending}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {isPending ? "Declining…" : "Decline"}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
