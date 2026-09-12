"use client";

import { useToast } from "@/lib/toast";

// Where confirmations appear: bottom of the screen, above every piece of
// chrome, below the progress bar.
//
// Bottom rather than top because the top edge already belongs to the teal
// bar and, on the public site, the sticky navbar -- and because a
// confirmation that covers the control you just used tells you what changed
// while hiding the thing that changed. On a phone it spans the width at the
// bottom, where a thumb can reach the dismiss.
export default function ToastViewport() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[9997] flex flex-col items-center gap-2 px-4 pb-4 sm:items-end sm:px-6 sm:pb-6"
      // One region for the stack, so a screen reader hears the sentence
      // rather than a region change per toast.
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.tone === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : toast.tone === "info"
                ? "border-slate-200 bg-white text-slate-800"
                : "border-teal-200 bg-teal-50 text-teal-900"
          }`}
        >
          <i
            aria-hidden
            className={`fa-solid mt-0.5 text-xs ${
              toast.tone === "error"
                ? "fa-circle-exclamation text-red-600"
                : toast.tone === "info"
                  ? "fa-circle-info text-slate-400"
                  : "fa-circle-check text-teal-600"
            }`}
          />
          <p className="flex-1 font-medium leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-lg px-1.5 py-0.5 text-lg leading-none opacity-50 transition hover:opacity-100"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
