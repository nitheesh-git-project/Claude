"use client";

import { useId, type ReactNode } from "react";
import OverlayPortal from "@/components/system/OverlayPortal";
import { useDialogChrome } from "@/lib/useDialogChrome";

export default function Modal({
  title,
  subtitle,
  onClose,
  onBack,
  backLabel = "Back",
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Where this dialog was opened from, when it replaced another one.
   *  One dialog is on screen at a time here, so a dialog that took the
   *  place of another has to offer the way back itself -- closing it
   *  otherwise drops the reader onto the table and makes them find what
   *  they were reading a tap ago all over again. */
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  // Escape, the focus trap and the focus restore all come from the one
  // hook every overlay in the app shares -- see useDialogChrome.
  const { panelRef, dialogProps } = useDialogChrome({ onClose, labelledBy: titleId });
  return (
    <OverlayPortal>
      <div
        // backdrop-blur-sm is a deliberate, platform-wide convention (not
        // just this dialog) -- every full-page pop-up should tint AND blur
        // the page behind it, not just dim it, so the modal reads as clearly
        // in front. Keep this on any future modal/overlay too.
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          {...dialogProps}
          className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4 gap-4">
            <div>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="mb-1.5 -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-[11px] font-semibold text-teal-700 transition hover:text-teal-900"
                >
                  <i aria-hidden className="fa-solid fa-arrow-left text-[9px]" />
                  {backLabel}
                </button>
              )}
              <h3 id={titleId} className="font-display font-bold text-lg text-slate-800">
                {title}
              </h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-slate-500 hover:text-slate-700 text-2xl leading-none shrink-0"
            >
              &times;
            </button>
          </div>
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}
