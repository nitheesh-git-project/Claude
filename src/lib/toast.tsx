"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * "Here is what just changed."
 *
 * Every mutating control in this app ends the same way: the request lands
 * and `router.refresh()` re-runs the Server Component, so the screen
 * re-renders into a state that looks identical to the one before it. A
 * toggle that was off is now on, and the only evidence is a switch the
 * person has already stopped looking at. That is fine for the admin who
 * flipped it deliberately and useless for everybody else -- and on a slow
 * render it is indistinguishable from nothing having happened at all.
 *
 * Three decisions:
 *
 * 1. **It survives the refresh.** The state lives in a provider mounted in
 *    the root layout, above every route, so `router.refresh()` re-renders
 *    the tree underneath it without unmounting this. No cookie, no
 *    sessionStorage, no replaying a message on the next page load.
 * 2. **It says what changed, not that something did.** "Home visits are on"
 *    rather than "Saved". A confirmation that does not name the thing is a
 *    spinner that stopped -- see `settingMessages.ts`, where that wording
 *    lives for every setting rather than at each call site.
 * 3. **It is announced once, politely.** One `aria-live="polite"` region
 *    for the stack, so a screen reader hears the sentence rather than a
 *    region change per toast.
 */

export type ToastTone = "success" | "error" | "info";

export type Toast = {
  id: number;
  /** The sentence. Names the thing that changed and its new state. */
  message: string;
  tone: ToastTone;
};

type ToastValue = {
  toasts: Toast[];
  /** Raise one. Returns nothing on purpose -- a caller that wants to know
   *  when it goes has a design problem, not a missing API. */
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

/** How long a confirmation stays. Long enough to read a sentence twice,
 *  short enough not to sit over the thing it is describing. Errors stay
 *  longer because they usually need acting on. */
const DISMISS_AFTER_MS = 4500;
const ERROR_DISMISS_AFTER_MS = 8000;

/** Beyond this the oldest goes. A bulk action can fire a dozen, and a stack
 *  taller than the screen is a stack nobody reads. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setToasts((current) => {
        // Same sentence already on screen: replace it rather than stack a
        // second copy. Flipping a switch twice is one fact, not two.
        const withoutDuplicate = current.filter((t) => t.message !== message);
        return [...withoutDuplicate, { id, message, tone }].slice(-MAX_VISIBLE);
      });
      const ms = tone === "error" ? ERROR_DISMISS_AFTER_MS : DISMISS_AFTER_MS;
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/**
 * Raising a toast from anywhere.
 *
 * Deliberately **does not throw** outside a provider. These controls render
 * in dashboards, in modals, and in the booking wizard on a public page, and
 * a missing confirmation must never be the thing that takes a screen down --
 * same posture as the audit log's best-effort write.
 */
export function useToast() {
  const context = useContext(ToastContext);
  const noop = useCallback(() => {}, []);
  return context ?? { toasts: [], show: noop, dismiss: noop };
}
