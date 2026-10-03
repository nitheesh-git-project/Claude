// What the booking wizards tell the page-level exit link.
//
// BookingExitLink sits outside the wizard (so it shows in every state without
// being repeated), which means it cannot see the wizard's state. On the
// payment step it must stay hidden until paying has plainly stopped working --
// a patient about to pay is offered no way out that abandons the purchase; the
// "go to your dashboard" escape belongs to someone who has failed
// MAX_ATTEMPTS_BEFORE_ESCAPE times. The wizard publishes the two facts that
// decide it; the link subscribes. A tiny external store rather than context,
// because the two are siblings under a server-rendered page.

import { useSyncExternalStore } from "react";

/** After this many failed or dismissed payment attempts the wizard offers its
 *  own way out, and the page-level exit link is allowed back. */
export const MAX_ATTEMPTS_BEFORE_ESCAPE = 3;

export type BookingPaymentTrouble = {
  onPaymentStep: boolean;
  failedAttempts: number;
};

const IDLE: BookingPaymentTrouble = { onPaymentStep: false, failedAttempts: 0 };
let current: BookingPaymentTrouble = IDLE;
const listeners = new Set<() => void>();

export function publishBookingPaymentTrouble(next: BookingPaymentTrouble) {
  if (
    next.onPaymentStep === current.onPaymentStep &&
    next.failedAttempts === current.failedAttempts
  ) {
    return;
  }
  current = next;
  listeners.forEach((l) => l());
}

/** Pure, so the rule is testable without rendering. */
export function exitLinkHidden(state: BookingPaymentTrouble): boolean {
  return state.onPaymentStep && state.failedAttempts < MAX_ATTEMPTS_BEFORE_ESCAPE;
}

export function useExitLinkHidden(): boolean {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => IDLE
  );
  return exitLinkHidden(state);
}
