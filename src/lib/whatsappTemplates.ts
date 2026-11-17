// The WhatsApp message templates, in code, so the wording submitted to Meta
// for approval and the parameters the sender fills can never disagree.
//
// Business-started WhatsApp messages must use a template Meta has approved
// in advance (category UTILITY for these: they are about a session the
// person booked). The clinic submits each one below, exactly as written,
// under exactly this name and language, from its WhatsApp Business account;
// docs/whatsapp/TEMPLATES.md is the copy to paste. Changing a body here means
// re-approval there first -- the name carries a version suffix for that.
//
// Like the emails: no condition, concern, note or Meet link, ever. Meta also
// refuses a parameter that is empty, has a newline or tab, or has more than
// four spaces in a row, so every value goes through `param()`; and a body
// may not start or end with a variable, so each ends with a few words.

import type { BookingFacts, CancelRefund, ReminderEvent } from "@/lib/bookingEmails";
import { formatInr } from "@/lib/formatMoney";

export type WhatsAppTemplateName =
  | "mr_booking_confirmed_v1"
  | "mr_booking_received_v1"
  | "mr_booking_cancelled_v1"
  | "mr_reminder_tomorrow_v1"
  | "mr_reminder_soon_v1";

export type WhatsAppTemplate = {
  name: WhatsAppTemplateName;
  language: "en";
  category: "UTILITY";
  /** The body exactly as submitted, with {{1}}... placeholders. */
  body: string;
  /** What each placeholder holds, in order, for the submission form's samples. */
  params: readonly string[];
  /** A filled-in example, as Meta asks for one with each submission. */
  sample: readonly string[];
};

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateName, WhatsAppTemplate> = {
  mr_booking_confirmed_v1: {
    name: "mr_booking_confirmed_v1",
    language: "en",
    category: "UTILITY",
    body: "Hello {{1}}, your {{2}} on {{3}} with {{4}} is confirmed. {{5}} You can join or manage it from your dashboard: {{6}} See you then.",
    params: ["first name", "session type", "date and time", "physiotherapist", "payment line", "dashboard link"],
    sample: ["Asha", "45-minute video session", "24 Nov 2026, 6:00 pm IST", "Dr. Meera", "Paid: ₹499.", "https://moverestorephysio.com/patient/dashboard"],
  },
  mr_booking_received_v1: {
    name: "mr_booking_received_v1",
    language: "en",
    category: "UTILITY",
    body: "Hello {{1}}, we have your booking for a {{2}} on {{3}}. We are matching you with a physiotherapist and will message you as soon as they are confirmed. Your dashboard: {{4}} Thank you.",
    params: ["first name", "session type", "date and time", "dashboard link"],
    sample: ["Asha", "45-minute video session", "24 Nov 2026, 6:00 pm IST", "https://moverestorephysio.com/patient/dashboard"],
  },
  mr_booking_cancelled_v1: {
    name: "mr_booking_cancelled_v1",
    language: "en",
    category: "UTILITY",
    body: "Hello {{1}}, your {{2}} on {{3}} has been cancelled. {{4}} You can book again from your dashboard: {{5}} Thank you.",
    params: ["first name", "session type", "date and time", "refund line", "dashboard link"],
    sample: ["Asha", "video session", "24 Nov 2026, 6:00 pm IST", "A refund of ₹499 is on its way; banks usually take 5 to 7 working days.", "https://moverestorephysio.com/patient/dashboard"],
  },
  mr_reminder_tomorrow_v1: {
    name: "mr_reminder_tomorrow_v1",
    language: "en",
    category: "UTILITY",
    body: "Hello {{1}}, a reminder that your {{2}} is tomorrow, {{3}}. {{4}} Your dashboard: {{5}} See you then.",
    params: ["first name", "session type", "date and time", "how it works", "dashboard link"],
    sample: ["Asha", "video session", "24 Nov 2026, 6:00 pm IST", "The Join button appears on your dashboard shortly before the start.", "https://moverestorephysio.com/patient/dashboard"],
  },
  mr_reminder_soon_v1: {
    name: "mr_reminder_soon_v1",
    language: "en",
    category: "UTILITY",
    body: "Hello {{1}}, your {{2}} starts in about an hour, at {{3}}. {{4}} Your dashboard: {{5}} See you soon.",
    params: ["first name", "session type", "time", "how it works", "dashboard link"],
    sample: ["Asha", "video session", "24 Nov 2026, 6:00 pm IST", "The Join button appears on your dashboard shortly before the start.", "https://moverestorephysio.com/patient/dashboard"],
  },
};

/** A value Meta will accept as a parameter: one line, no tabs, no long runs
 *  of spaces, never empty, at most 300 characters. */
export function param(value: string | null | undefined, fallback = "-"): string {
  const clean = (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 300);
  return clean || fallback;
}

function firstName(name: string): string {
  return param(name.trim().split(/\s+/)[0], "there");
}

function sessionType(f: Pick<BookingFacts, "mode" | "durationMinutes">, withLength: boolean): string {
  const kind = f.mode === "home_visit" ? "home visit" : "video session";
  return withLength && f.durationMinutes ? `${f.durationMinutes}-minute ${kind}` : kind;
}

function paymentLine(f: BookingFacts): string {
  const p = f.payment;
  if (p.kind === "paid") return `Paid: ${formatInr(p.amountPaise)}.`;
  if (p.kind === "free") return "Nothing to pay.";
  if (p.kind === "pay_later") return p.amountPaise ? `You pay ${formatInr(p.amountPaise)} after the session.` : "You pay after the session.";
  return "Thank you for booking.";
}

function howItWorks(f: Pick<BookingFacts, "mode">): string {
  return f.mode === "home_visit"
    ? "Your physiotherapist will come to the address you gave."
    : "The Join button appears on your dashboard shortly before the start.";
}

function refundLine(r: CancelRefund): string {
  if (r.kind === "refunded") return `${r.amountPaise ? `A refund of ${formatInr(r.amountPaise)}` : "Your refund"} is on its way; banks usually take 5 to 7 working days.`;
  if (r.kind === "refund_pending") return "The clinic will arrange your refund and let you know.";
  if (r.kind === "not_refunded") return "It was inside the no-refund window, so no refund applies.";
  if (r.kind === "programme") return "It was part of your programme; your dashboard shows the sessions you have left.";
  return "Nothing was charged for it.";
}

export type WhatsAppMessage = { template: WhatsAppTemplateName; params: string[] };

export function bookingConfirmedMessage(f: BookingFacts): WhatsAppMessage {
  return {
    template: "mr_booking_confirmed_v1",
    params: [firstName(f.name), sessionType(f, true), param(f.when), param(f.therapistName, "your physiotherapist"), paymentLine(f), param(f.dashboardUrl)],
  };
}

export function bookingReceivedMessage(f: BookingFacts): WhatsAppMessage {
  return { template: "mr_booking_received_v1", params: [firstName(f.name), sessionType(f, true), param(f.when), param(f.dashboardUrl)] };
}

export function bookingCancelledMessage(f: { name: string; when: string; mode: BookingFacts["mode"]; refund: CancelRefund; dashboardUrl: string }): WhatsAppMessage {
  return {
    template: "mr_booking_cancelled_v1",
    params: [firstName(f.name), sessionType({ mode: f.mode, durationMinutes: null }, false), param(f.when), refundLine(f.refund), param(f.dashboardUrl)],
  };
}

export function reminderMessage(f: BookingFacts, event: ReminderEvent): WhatsAppMessage {
  return {
    template: event === "reminder_1h" ? "mr_reminder_soon_v1" : "mr_reminder_tomorrow_v1",
    params: [firstName(f.name), sessionType(f, false), param(f.when), howItWorks(f), param(f.dashboardUrl)],
  };
}

/** The body as the person reads it, for the admin log and tests. */
export function renderTemplate(message: WhatsAppMessage): string {
  return WHATSAPP_TEMPLATES[message.template].body.replace(/\{\{(\d+)\}\}/g, (_, n) => message.params[Number(n) - 1] ?? "");
}
