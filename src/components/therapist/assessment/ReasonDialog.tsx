"use client";

import { useId } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";

/**
 * A short question with fixed answers: why a step is being stopped, skipped
 * or the whole assessment ended. Each answer is one 44px-plus button that
 * carries it out; there is no free text (the words are fixed so nothing can
 * leak a name into the record), and an answer is optional where the server
 * allows none.
 */
export default function ReasonDialog({
  title,
  body,
  options,
  noReasonLabel,
  confirmTone = "neutral",
  busy,
  onPick,
  onClose,
}: {
  title: string;
  body: string;
  options: readonly { key: string; label: string }[];
  /** When set, a button that carries on with no reason; omit where a reason is required. */
  noReasonLabel?: string;
  confirmTone?: "neutral" | "danger";
  busy: boolean;
  onPick: (key: string | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const { panelRef, dialogProps } = useDialogChrome({ onClose: () => (busy ? undefined : onClose()), labelledBy: titleId });
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center">
        <div ref={panelRef} {...dialogProps} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <h2 id={titleId} className="font-display text-lg font-bold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-700">{body}</p>
          <div className="mt-4 flex flex-col gap-2">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                disabled={busy}
                onClick={() => onPick(o.key)}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 text-left text-sm font-semibold text-slate-900 transition hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
              >
                {o.label}
              </button>
            ))}
            {noReasonLabel && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(null)}
                className={`min-h-[48px] rounded-xl px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${
                  confirmTone === "danger"
                    ? "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100 focus-visible:ring-red-600"
                    : "border border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100 focus-visible:ring-teal-600"
                }`}
              >
                {noReasonLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-[48px] rounded-xl px-4 text-sm font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
