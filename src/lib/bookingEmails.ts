// The booking emails a patient receives: received (paid, a physiotherapist
// still being matched), confirmed, and cancelled. Pure templates, every
// typed value escaped, the same layout as every other email (legalEmails.ts).
//
// What they never carry: anything about the patient's health -- no
// condition, no concern, no notes. An email can be forwarded, read on a
// shared device or kept by a mail provider for years; the session's time,
// type and price are what the patient needs, and the dashboard holds the
// rest behind a sign-in. A Meet link is not included either: it lives on the
// dashboard, where the Join button opens shortly before the start.

import { escapeHtml, layout, type Email, type EmailBrand } from "@/lib/legalEmails";
import { formatInr } from "@/lib/formatMoney";

export type SessionMode = "online" | "home_visit";

export type BookingPayment =
  | { kind: "paid"; amountPaise: number }
  | { kind: "free" }
  | { kind: "pay_later"; amountPaise: number | null }
  | { kind: "unknown" };

export type BookingFacts = {
  name: string;
  /** Already formatted in the clinic's zone, e.g. "Tue, 24 Nov 2026, 6:00 pm IST". */
  when: string;
  durationMinutes: number | null;
  mode: SessionMode;
  therapistName: string | null;
  payment: BookingPayment;
  dashboardUrl: string;
};

const MODE_TEXT: Record<SessionMode, string> = { online: "video session", home_visit: "home visit" };

function sessionLine(f: BookingFacts): string {
  const length = f.durationMinutes ? `${f.durationMinutes}-minute ` : "";
  return `Your ${length}${MODE_TEXT[f.mode]} on ${f.when}`;
}

function paymentLine(p: BookingPayment): string | null {
  if (p.kind === "paid") return `Paid: ${formatInr(p.amountPaise)}.`;
  if (p.kind === "free") return "Nothing to pay for this session.";
  if (p.kind === "pay_later") return p.amountPaise ? `You pay ${formatInr(p.amountPaise)} after the session.` : "You pay after the session.";
  return null;
}

function howItWorks(mode: SessionMode): string {
  return mode === "online"
    ? "When it is time, open your dashboard: the Join button appears shortly before the start."
    : "Your physiotherapist will come to the address you gave. Please be ready a few minutes early.";
}

function button(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escapeHtml(label)}</a>`;
}

const FOOTNOTE = "You are receiving this because you booked a session. Your health details are never sent by email; they stay on your dashboard.";

export function bookingConfirmedEmail(brand: EmailBrand, f: BookingFacts): Email {
  const subject = `Booked: your ${MODE_TEXT[f.mode]} on ${f.when}`;
  const withWhom = f.therapistName ? ` with ${f.therapistName}` : "";
  const pay = paymentLine(f.payment);
  const text =
    `Hello ${f.name},\n\n${sessionLine(f)}${withWhom} is confirmed.\n\n` +
    (pay ? `${pay}\n\n` : "") +
    `${howItWorks(f.mode)}\n\nYour dashboard: ${f.dashboardUrl}\n\nTo cancel or ask a question, use your dashboard.\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "Your session is booked",
    [
      `Hello ${escapeHtml(f.name)},`,
      `${escapeHtml(sessionLine(f))}${f.therapistName ? ` with <strong>${escapeHtml(f.therapistName)}</strong>` : ""} is confirmed.`,
      ...(pay ? [escapeHtml(pay)] : []),
      escapeHtml(howItWorks(f.mode)),
      button(f.dashboardUrl, "Open my dashboard"),
      "To cancel or ask a question, use your dashboard.",
    ],
    FOOTNOTE
  );
  return { subject, text, html };
}

export function bookingReceivedEmail(brand: EmailBrand, f: BookingFacts): Email {
  const subject = `We have your booking for ${f.when}`;
  const pay = paymentLine(f.payment);
  const text =
    `Hello ${f.name},\n\nThank you. ${sessionLine(f)} is booked, and we are matching you with a physiotherapist now. ` +
    `We will email you again as soon as they are confirmed.\n\n` +
    (pay ? `${pay}\n\n` : "") +
    `Your dashboard: ${f.dashboardUrl}\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "We have your booking",
    [
      `Hello ${escapeHtml(f.name)},`,
      `Thank you. ${escapeHtml(sessionLine(f))} is booked, and we are matching you with a physiotherapist now. We will email you again as soon as they are confirmed.`,
      ...(pay ? [escapeHtml(pay)] : []),
      button(f.dashboardUrl, "Open my dashboard"),
    ],
    FOOTNOTE
  );
  return { subject, text, html };
}

/**
 * The clinic declined a patient's request to pay after the session (owner's
 * decision: every pay-later booking is approved by a person). The session is
 * not cancelled -- it is now an ordinary booking the patient can pay for
 * online from their dashboard -- and the email says so, with the clinic's own
 * reason, rather than leaving them to find a "Pay now" button unexplained.
 */
export function payLaterDeclinedEmail(brand: EmailBrand, f: BookingFacts & { reason: string }): Email {
  const subject = `About paying later for ${f.when}`;
  const reason = f.reason.trim();
  const text =
    `Hello ${f.name},\n\nWe can't offer pay-later for this booking. The clinic said: "${reason}"\n\n` +
    `${sessionLine(f)} is still held for you. To keep it, pay for the session online from your dashboard.\n\n` +
    `Your dashboard: ${f.dashboardUrl}\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "About paying later",
    [
      `Hello ${escapeHtml(f.name)},`,
      `We can't offer pay-later for this booking. The clinic said: &ldquo;${escapeHtml(reason)}&rdquo;`,
      `${escapeHtml(sessionLine(f))} is still held for you. To keep it, pay for the session online from your dashboard.`,
      button(f.dashboardUrl, "Pay from my dashboard"),
    ],
    FOOTNOTE
  );
  return { subject, text, html };
}

export type CancelRefund =
  | { kind: "refunded"; amountPaise: number | null }
  | { kind: "refund_pending" }
  | { kind: "none_paid" }
  | { kind: "not_refunded" }
  | { kind: "programme" };

export type CancelFacts = {
  name: string;
  when: string;
  mode: SessionMode;
  byClinic: boolean;
  refund: CancelRefund;
  dashboardUrl: string;
};

function refundLine(r: CancelRefund): string | null {
  if (r.kind === "refunded") {
    return `${r.amountPaise ? `A refund of ${formatInr(r.amountPaise)}` : "Your refund"} is on its way to the card or account you paid with. Banks usually take 5 to 7 working days to show it.`;
  }
  if (r.kind === "refund_pending") return "Your refund could not be sent automatically, so the clinic will arrange it and let you know.";
  if (r.kind === "not_refunded") return "This cancellation was inside the no-refund window, so no refund applies.";
  if (r.kind === "programme") return "This session was part of your programme. Your dashboard shows the sessions you have left.";
  return null;
}

export function bookingCancelledEmail(brand: EmailBrand, f: CancelFacts): Email {
  const subject = `Cancelled: your ${MODE_TEXT[f.mode]} on ${f.when}`;
  const who = f.byClinic ? "The clinic has cancelled" : "You cancelled";
  const refund = refundLine(f.refund);
  const text =
    `Hello ${f.name},\n\n${who} your ${MODE_TEXT[f.mode]} on ${f.when}.\n\n` +
    (refund ? `${refund}\n\n` : "") +
    `You can book another session from your dashboard: ${f.dashboardUrl}\n\n${brand.siteName}`;
  const html = layout(
    brand,
    "Your session is cancelled",
    [
      `Hello ${escapeHtml(f.name)},`,
      `${who} your ${MODE_TEXT[f.mode]} on <strong>${escapeHtml(f.when)}</strong>.`,
      ...(refund ? [escapeHtml(refund)] : []),
      button(f.dashboardUrl, "Book another session"),
    ],
    FOOTNOTE
  );
  return { subject, text, html };
}

// --- From the appointment row to the email's facts (pure, unit-tested) -------

/** The appointment columns the booking emails read. */
export type AppointmentEmailRow = {
  status?: string | null;
  visit_mode?: string | null;
  payment_status?: string | null;
  payment_terms?: string | null;
  amount_paid_paise?: number | null;
  amount_due_paise?: number | null;
  package_purchase_id?: string | null;
  home_visit_purchase_id?: string | null;
  refund_status?: string | null;
  refund_amount_paise?: number | null;
};

export function sessionModeOf(row: AppointmentEmailRow): SessionMode {
  return row.visit_mode === "home_visit" ? "home_visit" : "online";
}

function fromProgramme(row: AppointmentEmailRow): boolean {
  return !!row.package_purchase_id || !!row.home_visit_purchase_id;
}

/** What the confirmation says about money. A programme session was paid for
 *  with the programme, so it names no figure. */
export function bookingPaymentOf(row: AppointmentEmailRow): BookingPayment {
  if (row.payment_terms === "pay_later") return { kind: "pay_later", amountPaise: row.amount_due_paise ?? null };
  if (fromProgramme(row)) return { kind: "unknown" };
  if (row.payment_status === "paid") {
    const paid = row.amount_paid_paise ?? 0;
    return paid > 0 ? { kind: "paid", amountPaise: paid } : { kind: "free" };
  }
  return { kind: "unknown" };
}

/** Whether a cancelled session was ever really booked: paid (or free), pay
 *  later, or from a programme. An abandoned, unpaid checkout that is
 *  cancelled gets no email -- the patient never had a session to lose. */
export function cancellationIsWorthEmailing(row: AppointmentEmailRow): boolean {
  return row.payment_status === "paid" || row.payment_terms === "pay_later" || fromProgramme(row);
}

/** What the cancellation email says about money, read from the row AFTER
 *  cancelAppointmentAndRefund wrote it. */
export function cancelRefundOf(row: AppointmentEmailRow): CancelRefund {
  if (row.refund_status === "processed") return { kind: "refunded", amountPaise: row.refund_amount_paise ?? null };
  if (row.refund_status === "failed" || row.refund_status === "manual_pending") return { kind: "refund_pending" };
  if (row.refund_status === "not_eligible") return { kind: "not_refunded" };
  if (fromProgramme(row)) return { kind: "programme" };
  return { kind: "none_paid" };
}

// --- Reminders ----------------------------------------------------------------

export type ReminderEvent = "reminder_24h" | "reminder_1h";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The windows the half-hourly maintenance run sends in. Wide on purpose:
 *  GitHub's scheduler can run late, and a window narrower than the gap
 *  between two runs would skip a session. Each reminder is still sent once
 *  (appointment_emails). */
export const REMINDER_WINDOWS: Record<ReminderEvent, { fromMs: number; toMs: number }> = {
  // The day before: anywhere from 25 hours to 18 hours ahead.
  reminder_24h: { fromMs: 18 * HOUR, toMs: 25 * HOUR },
  // Shortly before: from 90 minutes ahead down to 15 -- later than that a
  // reminder is noise, not help.
  reminder_1h: { fromMs: 15 * MINUTE, toMs: 90 * MINUTE },
};

/** Which reminder (if any) is due for a confirmed session now. A session
 *  booked inside the day-before window already had its confirmation minutes
 *  ago, so it gets no day-before reminder. */
export function dueReminder(input: { slotMs: number; nowMs: number; bookedAtMs: number | null }): ReminderEvent | null {
  const ahead = input.slotMs - input.nowMs;
  const w1 = REMINDER_WINDOWS.reminder_1h;
  if (ahead > w1.fromMs && ahead <= w1.toMs) return "reminder_1h";
  const w24 = REMINDER_WINDOWS.reminder_24h;
  if (ahead > w24.fromMs && ahead <= w24.toMs) {
    const bookedAhead = input.bookedAtMs === null ? Infinity : input.slotMs - input.bookedAtMs;
    return bookedAhead > w24.toMs ? "reminder_24h" : null;
  }
  return null;
}

/** The day-before video reminder's pointer to the get-ready list. */
export const GET_READY_LINE = "Before tomorrow, open your dashboard to see the few things to have ready for your session.";

export function bookingReminderEmail(brand: EmailBrand, f: BookingFacts, event: ReminderEvent): Email {
  const soon = event === "reminder_1h";
  const subject = soon ? `Starting soon: your ${MODE_TEXT[f.mode]} at ${f.when}` : `Tomorrow: your ${MODE_TEXT[f.mode]} on ${f.when}`;
  const withWhom = f.therapistName ? ` with ${f.therapistName}` : "";
  const lead = soon ? `${sessionLine(f)}${withWhom} starts in about an hour.` : `A reminder: ${sessionLine(f)}${withWhom} is tomorrow.`;
  // The day before a video session: a pointer to the get-ready list on the
  // dashboard (guided check, phase 2). Never the list itself - what a patient
  // needs to have ready says something about their condition, and an email
  // carries none of that.
  const getReady = !soon && f.mode === "online" ? GET_READY_LINE : null;
  const text = `Hello ${f.name},\n\n${lead}\n\n${howItWorks(f.mode)}${getReady ? `\n\n${getReady}` : ""}\n\nYour dashboard: ${f.dashboardUrl}\n\nCan't make it? Cancel from your dashboard.\n\n${brand.siteName}`;
  const html = layout(
    brand,
    soon ? "Your session starts soon" : "Your session is tomorrow",
    [
      `Hello ${escapeHtml(f.name)},`,
      escapeHtml(lead),
      escapeHtml(howItWorks(f.mode)),
      ...(getReady ? [escapeHtml(getReady)] : []),
      button(f.dashboardUrl, soon && f.mode === "online" ? "Open my dashboard to join" : "Open my dashboard"),
      "Can't make it? Cancel from your dashboard.",
    ],
    FOOTNOTE
  );
  return { subject, text, html };
}
