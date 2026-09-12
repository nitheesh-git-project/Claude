"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The dialog contract, in one place: Escape closes, focus moves into the
 * panel and returns to whatever opened it, Tab is trapped inside while it is
 * up, and the page behind stops scrolling.
 *
 * The public site's `Modal.tsx` grew this by hand and every other overlay in
 * the app was built without it -- so the confirmation guarding a refund, the
 * admin's session drawer and the clinician's exam dialog could not be
 * dismissed from the keyboard, never announced themselves as dialogs, and
 * left Tab walking the page underneath. A screen reader reached a prompt it
 * was never told had opened. One hook rather than one more copy, for the
 * reason `Modal.tsx` gives about the four card grids: N copies of a contract
 * is N chances for one of them to strand focus behind a backdrop.
 *
 * `panelRef` goes on the dialog panel, `dialogProps` spreads onto it. The
 * caller keeps its own layout, backdrop and animation -- this is the
 * behaviour, not the shape.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useDialogChrome({
  onClose,
  label,
  labelledBy,
  /** An alert dialog interrupts to ask something; a plain dialog does not. */
  alert = false,
  /**
   * False while the dialog is not on screen. Most callers mount the dialog
   * only when it is open and can leave this alone; a component that renders
   * itself all the time and toggles an `open` prop must pass it, or a closed
   * dialog would still hold the scroll lock and the focus trap.
   */
  active = true,
}: {
  onClose: () => void;
  /** The dialog's name, when no heading inside it can supply one. */
  label?: string;
  /** id of the heading that names this dialog, preferred over `label`. */
  labelledBy?: string;
  alert?: boolean;
  active?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // Held in a ref so the effect below runs once per open rather than on
  // every render of a caller that rebuilds its close handler inline -- which
  // is most of them, and would otherwise re-run focus and steal the cursor
  // out of a field mid-typing. Synced in its own effect rather than during
  // render, and declared before the effect that reads it so it is already
  // current by the time a key can be pressed.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const focusables = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
  }, []);

  useEffect(() => {
    if (!active) return;
    lastFocused.current = document.activeElement as HTMLElement | null;

    // Focus the first thing worth typing into, falling back to the panel so
    // the reader is inside the dialog either way. Deferred a frame because
    // an animating panel can still be display:none on the commit that
    // mounts it.
    const raf = requestAnimationFrame(() => {
      const first = focusables()[0];
      if (first) first.focus();
      else panelRef.current?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const focused = document.activeElement as HTMLElement | null;
      // Wrap at both ends, and pull focus back in if it has already escaped
      // (a click on the backdrop leaves it on <body>).
      if (!panelRef.current?.contains(focused)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && focused === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && focused === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      // Back to the control that opened this, so a keyboard user resumes
      // where they were rather than at the top of the page.
      lastFocused.current?.focus?.();
    };
  }, [active, focusables]);

  return {
    panelRef,
    dialogProps: {
      role: alert ? ("alertdialog" as const) : ("dialog" as const),
      "aria-modal": true as const,
      ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
      ...(label && !labelledBy ? { "aria-label": label } : {}),
      tabIndex: -1,
    },
  };
}
