// What one session is worth, wherever a figure is read off it.
//
// Three modules read this and they do NOT share a fallback -- adminMetrics
// falls back to the standard session fee, therapistPayouts falls back to 0,
// and therapistEarnings falls back to a value its caller passes in. Those
// differences are deliberate and long-standing: a money screen showing a
// session at the standard fee is a reasonable guess, while paying a therapist
// a share of a guessed amount is not.
//
// So the fallback is an ARGUMENT rather than a constant in here. Pay later
// added a second real source for the figure (a frozen price on a session that
// has been delivered and not yet paid for), and the only safe way to introduce
// it was to slot it in BEFORE each caller's existing fallback and leave that
// fallback exactly as it was. A shared helper hard-coding the session fee
// would have made every already-paid session with a null amount start
// contributing the full fee to a therapist's payout where it contributes
// nothing today -- changing what the clinic owes real people, on sessions with
// no connection to this feature.
//
// amount_due_paise is null on every row that predates pay later, so the middle
// term collapses away and each caller behaves exactly as it did.

export type SessionAmountRow = {
  amount_paid_paise?: number | null;
  amount_due_paise?: number | null;
};

export function sessionAmountPaise(a: SessionAmountRow, fallbackPaise: number): number {
  return a.amount_paid_paise ?? a.amount_due_paise ?? fallbackPaise;
}
