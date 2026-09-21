// What trusted patients owe the clinic, dependency-free.
//
// Some long-standing patients are allowed to pay after treatment rather than
// before it. This module turns their appointment rows into the two figures
// that are the whole safety net for that arrangement: how much is owed, and
// how long the oldest of it has been owed.
//
// Same shape and the same reasoning as therapistCashLedger.ts, deliberately --
// that module answers "money the business is owed by a therapist who is
// holding it", this one answers "money the business is owed by a patient who
// has been treated". One is the mirror of the other, and neither invents a
// score: the timestamps and the frozen amount are the assertion.
//
// THE RULE THAT MAKES ALL OF THIS SIMPLE: nothing is owed until the work is
// done. A booked session owes nothing, so there is no half-state to carry; a
// late cancellation owes nothing, automatically, because it never reached
// 'completed'. Everything below filters on that one word.

/** A session, as the balance reads it. */
export type PayLaterAppointment = {
  id: string;
  patient_id: string;
  status: string;
  slot_time: string | null;
  payment_status: string;
  payment_terms?: string | null;
  amount_due_paise?: number | null;
  pay_later_outcome?: string | null;
};

/** A payment the patient has made, once somebody has confirmed it arrived. */
export type PayLaterPaymentRow = {
  id: string;
  patient_id: string;
  status: string;
  /** What has not yet been applied to a session. See allocation below. */
  unallocated_paise?: number | null;
};

export type PatientBalance = {
  patientId: string;
  /** Delivered, unsettled sessions, net of money already received. */
  owedPaise: number;
  /** How many sessions that is. */
  owedCount: number;
  /** Confirmed money not yet applied to a session. */
  unallocatedPaise: number;
};

/**
 * Is this session one the clinic is waiting to be paid for?
 *
 * `payment_terms` and `amount_due_paise` are the newest columns on
 * appointments, so both may be absent on a database that has not run the
 * migration -- in which case this is false for every row and every figure
 * below reads zero, which is exactly right.
 */
export function isOpenPayLaterSession(a: PayLaterAppointment): boolean {
  if (a.payment_terms !== "pay_later") return false;
  // Delivered. Not "booked", not "cancelled" -- the one word everything keys on.
  if (a.status !== "completed") return false;
  if (a.payment_status === "paid") return false;
  // A written-off debt is not owed. It is a cost, recorded elsewhere.
  if (a.pay_later_outcome === "written_off") return false;
  return true;
}

/** What one session contributes. A missing amount contributes nothing rather
 *  than a guessed one -- a figure invented here would be a figure somebody is
 *  asked to collect. */
function dueOf(a: PayLaterAppointment): number {
  return Math.max(0, a.amount_due_paise ?? 0);
}

/**
 * One patient's balance.
 *
 * Owed is net of `unallocated_paise` -- money the clinic has received and not
 * yet applied to a session. Someone who owes 4,800 and has handed over 2,000
 * against it owes 3,600, and telling them 4,800 would be asking twice for
 * money already in the till.
 */
export function computePatientBalance(
  patientId: string,
  appointments: PayLaterAppointment[],
  payments: PayLaterPaymentRow[] = []
): PatientBalance {
  let grossPaise = 0;
  let owedCount = 0;
  for (const a of appointments) {
    if (a.patient_id !== patientId) continue;
    if (!isOpenPayLaterSession(a)) continue;
    grossPaise += dueOf(a);
    owedCount += 1;
  }

  let unallocatedPaise = 0;
  for (const p of payments) {
    if (p.patient_id !== patientId) continue;
    if (p.status !== "confirmed") continue;
    unallocatedPaise += Math.max(0, p.unallocated_paise ?? 0);
  }

  return {
    patientId,
    owedPaise: Math.max(0, grossPaise - unallocatedPaise),
    owedCount,
    unallocatedPaise,
  };
}

/** Every patient who owes something, largest first. A patient who owes
 *  nothing is not a row: an owed list of zeroes is a list nobody reads. */
export function computeClinicReceivable(
  appointments: PayLaterAppointment[],
  payments: PayLaterPaymentRow[] = []
): { totalPaise: number; balances: PatientBalance[] } {
  const patientIds = new Set<string>();
  for (const a of appointments) {
    if (isOpenPayLaterSession(a)) patientIds.add(a.patient_id);
  }

  const balances: PatientBalance[] = [];
  let totalPaise = 0;
  for (const patientId of patientIds) {
    const balance = computePatientBalance(patientId, appointments, payments);
    if (balance.owedPaise <= 0) continue;
    balances.push(balance);
    totalPaise += balance.owedPaise;
  }

  balances.sort((a, b) => b.owedPaise - a.owedPaise);
  return { totalPaise, balances };
}

/**
 * How long the oldest unsettled session has been owed, in whole days.
 *
 * The early warning, and with no ceiling on what a patient may owe it is the
 * only automatic one there is. A patient owing 1,200 for a week is ordinary;
 * the same 1,200 for four months is the thing this exists to make visible.
 * Measured from the session's own slot time, since that is when the clinic
 * gave the value.
 */
export function oldestOwedAgeDays(
  appointments: PayLaterAppointment[],
  nowMs: number
): number | null {
  let oldestMs: number | null = null;
  for (const a of appointments) {
    if (!isOpenPayLaterSession(a)) continue;
    if (!a.slot_time) continue;
    const slotMs = new Date(a.slot_time).getTime();
    if (Number.isNaN(slotMs)) continue;
    if (oldestMs === null || slotMs < oldestMs) oldestMs = slotMs;
  }
  if (oldestMs === null) return null;
  return Math.max(0, Math.floor((nowMs - oldestMs) / 86_400_000));
}

/**
 * Sessions that have been and gone and were never marked completed.
 *
 * The one place in this design where money can silently fail to exist. Debt,
 * revenue and the therapist's own pay all appear at completion -- so a session
 * nobody closed produces none of the three, and no screen has anything to show.
 * Every other failure here is a wrong number, which a check can catch; this one
 * is an absent number, which nothing would.
 */
export function unclosedPayLaterSessions(
  appointments: PayLaterAppointment[],
  nowMs: number
): PayLaterAppointment[] {
  return appointments.filter((a) => {
    if (a.payment_terms !== "pay_later") return false;
    if (a.status === "completed" || a.status === "cancelled") return false;
    if (!a.slot_time) return false;
    const slotMs = new Date(a.slot_time).getTime();
    if (Number.isNaN(slotMs)) return false;
    return slotMs < nowMs;
  });
}
