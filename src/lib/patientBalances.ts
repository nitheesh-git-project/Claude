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

/**
 * How long a balance may sit before it is worth a phone call -- the DEFAULT,
 * where `site_settings.pay_later_aged_after_days` is the clinic's own answer.
 *
 * 60 is deliberately generous: these are patients who settle monthly, so
 * anything under a month is simply the arrangement working.
 *
 * It is configurable, where a threshold in this codebase normally is not,
 * because with no ceiling on what a trusted patient may owe this number is the
 * only automatic warning the feature has. A clinic settling weekly wants it far
 * below 60; one settling quarterly wants it above, or the warning is on
 * permanently and becomes the badge nobody reads. Unset or unreadable resolves
 * back to here, so a database without the migration behaves exactly as it did.
 */
export const PAY_LATER_AGED_AFTER_DAYS = 60;

/**
 * The bounds the column, the route and `readPayLaterAgedAfterDays` all share.
 *
 * There is deliberately no zero, unlike `splash_revisit_minutes` and
 * `journey_step_seconds` where zero means "off". Here it is ambiguous -- it
 * reads as "chase everything" to one person and "never warn me" to another --
 * and a warning whose meaning depends on who set it is worse than no setting.
 * The ceiling is not a policy: past a year the warning is inert anyway, and it
 * exists so a mistyped 3650 is refused rather than quietly switching the only
 * automatic warning off.
 */
export const MIN_PAY_LATER_AGED_AFTER_DAYS = 1;
export const MAX_PAY_LATER_AGED_AFTER_DAYS = 365;

/** What the clinic's stored answer came to, and why. */
export type AgedAfterDays = {
  /** The number in force. */
  days: number;
  /** Whether that number is the clinic's own or the built-in default. */
  source: "clinic" | "default";
  /**
   * The stored number that could not be used, when that is why the default is
   * in force. Null for the ordinary unset case, which is not a fault and must
   * not be reported as one.
   */
  ignoredValue: number | null;
};

/**
 * What the clinic's stored answer resolves to, and why -- the judgement with
 * the database taken out, so it is unit-tested rather than only clicked. Same
 * shape as `decideAutoAssignment` beside `pickAutoAssignTherapist`.
 *
 * Anything unusable resolves to the default rather than to a bound. There is
 * no safe direction to fail in here: this decides the colour of a warning, and
 * too low is on permanently while too high never fires -- so an unreadable
 * setting means the behaviour the clinic had before anybody set one.
 *
 * Out-of-range is included in "unusable" on purpose. The column's CHECK and
 * the route both refuse those, but a value typed by hand in the SQL editor
 * passes neither, and a 0 read back from such a row would paint every balance
 * amber on the one screen whose job is to make one stand out.
 *
 * It carries the REASON rather than only the number because a fallback nobody
 * is told about is a screen disagreeing with its own database: the figure says
 * 60, the row says 3650, and nothing on the page reconciles them. The same
 * correction the admin dashboard's failed-read banner makes -- a value that
 * could not be used is not a value that was never set.
 */
export function describeAgedAfterDays(raw: unknown): AgedAfterDays {
  const fallback = (ignoredValue: number | null): AgedAfterDays => ({
    days: PAY_LATER_AGED_AFTER_DAYS,
    source: "default",
    ignoredValue,
  });
  // Unset, null, or a type nothing could have meant: nobody chose anything.
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback(null);
  // A number that IS there and cannot be used -- the case worth a sentence.
  if (!Number.isInteger(raw)) return fallback(raw);
  if (raw < MIN_PAY_LATER_AGED_AFTER_DAYS) return fallback(raw);
  if (raw > MAX_PAY_LATER_AGED_AFTER_DAYS) return fallback(raw);
  return { days: raw, source: "clinic", ignoredValue: null };
}

/**
 * The number alone. Kept exactly as it was so every existing caller and every
 * existing test is untouched by the split -- which is the whole guarantee that
 * adding the reason changed no behaviour.
 */
export function resolveAgedAfterDays(raw: unknown): number {
  return describeAgedAfterDays(raw).days;
}

/**
 * The ageing warning as the screens read it: how many days, and whether the
 * clinic wants to be warned at all.
 *
 * `enabled` is a switch rather than a zero in `days`, because zero here is
 * ambiguous -- it reads as "chase everything" to one person and "never warn
 * me" to another. The switch says which in words, and `days` is kept while it
 * is off so switching back on restores the number the clinic chose rather than
 * the default.
 */
export type PayLaterAgeRule = { days: number; enabled: boolean };

/**
 * Is this balance old enough to chase?
 *
 * One answer for the three readers -- the total's colour, each patient card's
 * amber, and the alert count on Today -- because a count that disagrees with
 * the rows beneath it is the failure this codebase corrects most often.
 * Exactly at the threshold counts; one day under does not.
 */
export function isAgedBalance(ageDays: number | null, rule: PayLaterAgeRule): boolean {
  if (!rule.enabled) return false;
  if (ageDays === null) return false;
  return ageDays >= rule.days;
}

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
