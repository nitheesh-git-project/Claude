// What the patient Overview says when there is no next session.
//
// "Nothing booked yet" is true for a patient who has never booked. Said to a
// returning patient -- one with a paid session behind them and none ahead --
// it reads as though their history had been lost, on the screen whose job is
// "how am I doing". A patient with history is told there is nothing coming
// up instead. Dependency-free so it can be tested without rendering.

export type HistoryRow = {
  status: string;
  payment_status?: string | null;
  paid_at?: string | null;
};

/**
 * Whether this patient has ever really booked: a session that happened, or
 * one that was paid for (a refunded cancellation still counts -- it was a
 * booking). An abandoned checkout -- unpaid and never completed -- is not
 * one; it is the "Payment not completed" item the feed already names.
 */
export function hasBookingHistory(rows: HistoryRow[]): boolean {
  return rows.some(
    (r) => r.status === "completed" || r.payment_status === "paid" || Boolean(r.paid_at)
  );
}

/** The Next session tile's note when there is no next session. */
export function noNextSessionNote(history: boolean): string {
  return history ? "No upcoming sessions" : "Nothing booked yet";
}

/** The Overview headline when there is no next session and nothing unbooked. */
export function noNextSessionHeadline(history: boolean): string {
  return history
    ? "No upcoming sessions - book your next one whenever you're ready."
    : "Nothing booked yet - pick a time that suits you and your therapist takes it from there.";
}
