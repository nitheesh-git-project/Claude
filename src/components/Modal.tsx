"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The public site's detail dialog: backdrop, panel, and the whole hand-rolled
 * dialog contract in one place -- labelled, Escape to close, focus moved to
 * the close button on open and restored to the trigger on close, background
 * scroll locked while it is up, and a backdrop click that closes without
 * swallowing clicks inside the panel.
 *
 * Extracted because four card grids (therapists, session packages, home-visit
 * packages, programmes) all open one of these. Four copies of the contract is
 * four chances for one of them to leak a scroll lock or strand focus behind
 * the backdrop, which is exactly the kind of bug nobody notices in review.
 *
 * The panel is bottom-sheet on phones and centred from `sm:` up, since these
 * are long documents and a phone reader thumbs them upward.
 */
export default function Modal({
  open,
  onClose,
  labelledBy,
  closeLabel,
  closeTone = "light",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the heading inside `children` that names this dialog. */
  labelledBy: string;
  closeLabel: string;
  /** "dark" for panels whose header is a dark image or gradient. */
  closeTone?: "light" | "dark";
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Focus goes back to the card that opened this, so a keyboard visitor
      // resumes where they were in the grid rather than at the top of the page.
      lastFocused.current?.focus?.();
    };
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
          >
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={closeLabel}
              className={`absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 ${
                closeTone === "dark"
                  ? "bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 focus-visible:ring-teal-500"
              }`}
            >
              <i aria-hidden="true" className="fa-solid fa-xmark" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Holds on to the last non-null value so a dialog's content survives its own
 * close animation. Without it the caller clears its selection, the children
 * unmount on the same frame, and the panel plays its exit as an empty white
 * rectangle.
 */
export function useLastNonNull<T>(value: T | null): T | null {
  const [held, setHeld] = useState<T | null>(value);
  if (value !== null && value !== held) setHeld(value);
  return value ?? held;
}
