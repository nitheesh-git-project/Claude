// What the booking wizards tell the page-level exit link.
//
// BookingExitLink sits outside the wizard (so it shows in every state without
// being repeated), which means it cannot see the wizard's state. On the
// payment step it must stay hidden until paying has plainly stopped working --
// a patient about to pay is offered no way out that abandons the purchase; the
// "go to your dashboard" escape belongs to someone whose dashboard is open to
// them and who has failed `site_settings.payment_tries_before_access` times
// (see src/lib/paymentTries.ts). The wizard publishes the two facts that
// decide it; the link subscribes. A tiny external store rather than context,
// because the two are siblings under a server-rendered page.

import { useSyncExternalStore } from "react";

export type BookingPaymentTrouble = {
  onPaymentStep: boolean;
  /** The wizard is offering its own way to the dashboard: the account is
   *  unlocked and paying here has failed often enough. */
  escapeOpen: boolean;
};

const IDLE: BookingPaymentTrouble = { onPaymentStep: false, escapeOpen: false };
let current: BookingPaymentTrouble = IDLE;
const listeners = new Set<() => void>();

export function publishBookingPaymentTrouble(next: BookingPaymentTrouble) {
  if (
    next.onPaymentStep === current.onPaymentStep &&
    next.escapeOpen === current.escapeOpen
  ) {
    return;
  }
  current = next;
  listeners.forEach((l) => l());
}

/** Pure, so the rule is testable without rendering. */
export function exitLinkHidden(state: BookingPaymentTrouble): boolean {
  return state.onPaymentStep && !state.escapeOpen;
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
