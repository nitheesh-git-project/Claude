import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingPaymentOf,
  bookingReceivedEmail,
  bookingReminderEmail,
  dueReminder,
  cancelRefundOf,
  cancellationIsWorthEmailing,
  sessionModeOf,
  type BookingFacts,
} from "@/lib/bookingEmails";

const brand = { siteName: "MoveRestore Physiotherapy", siteUrl: "https://moverestorephysio.com" };
const facts: BookingFacts = {
  name: "Asha <Rao>",
  when: "24 Nov 2026, 6:00 pm IST",
  durationMinutes: 45,
  mode: "online",
  therapistName: "Dr. Meera",
  payment: { kind: "paid", amountPaise: 49900 },
  dashboardUrl: "https://moverestorephysio.com/patient/dashboard",
};

describe("booking emails", () => {
  it("confirm the session, its time, who and what was paid, and escape what was typed", () => {
    const e = bookingConfirmedEmail(brand, facts);
    expect(e.subject).toBe("Booked: your video session on 24 Nov 2026, 6:00 pm IST");
    expect(e.text).toContain("45-minute video session on 24 Nov 2026, 6:00 pm IST with Dr. Meera is confirmed");
    expect(e.text).toContain("Paid: ₹499.");
    expect(e.html).toContain("Asha &lt;Rao&gt;");
    expect(e.html).not.toContain("<Rao>");
    expect(e.html).toContain('href="https://moverestorephysio.com/patient/dashboard"');
  });

  it("say what a home visit and pay later mean", () => {
    const e = bookingConfirmedEmail(brand, { ...facts, mode: "home_visit", payment: { kind: "pay_later", amountPaise: 120000 } });
    expect(e.text).toContain("come to the address you gave");
    expect(e.text).toContain("You pay ₹1,200 after the session.");
  });

  it("tell a paid booking with nobody assigned yet that a physiotherapist is being matched", () => {
    const e = bookingReceivedEmail(brand, { ...facts, therapistName: null });
    expect(e.subject).toBe("We have your booking for 24 Nov 2026, 6:00 pm IST");
    expect(e.text).toContain("matching you with a physiotherapist");
  });

  it("never carry health details: the templates take no condition, concern or note", () => {
    const source = readFileSync("src/lib/bookingEmails.ts", "utf8");
    const factsTypes = source.slice(source.indexOf("export type BookingFacts"), source.indexOf("const MODE_TEXT"));
    for (const word of ["concern", "condition", "note", "diagnosis", "pain"]) expect(factsTypes.toLowerCase()).not.toContain(word);
  });

  it("say who cancelled and what happens to the money", () => {
    const base = { name: "Asha", when: facts.when, mode: "online" as const, dashboardUrl: facts.dashboardUrl };
    expect(bookingCancelledEmail(brand, { ...base, byClinic: true, refund: { kind: "refunded", amountPaise: 49900 } }).text).toContain(
      "The clinic has cancelled your video session"
    );
    expect(bookingCancelledEmail(brand, { ...base, byClinic: false, refund: { kind: "refunded", amountPaise: 49900 } }).text).toContain(
      "A refund of ₹499 is on its way"
    );
    expect(bookingCancelledEmail(brand, { ...base, byClinic: false, refund: { kind: "not_refunded" } }).text).toContain("no refund applies");
    expect(bookingCancelledEmail(brand, { ...base, byClinic: false, refund: { kind: "none_paid" } }).text).not.toMatch(/refund/i);
  });
});

describe("from the appointment row", () => {
  it("reads the payment", () => {
    expect(bookingPaymentOf({ payment_status: "paid", amount_paid_paise: 49900 })).toEqual({ kind: "paid", amountPaise: 49900 });
    expect(bookingPaymentOf({ payment_status: "paid", amount_paid_paise: 0 })).toEqual({ kind: "free" });
    expect(bookingPaymentOf({ payment_status: "unpaid", payment_terms: "pay_later", amount_due_paise: 50000 })).toEqual({
      kind: "pay_later",
      amountPaise: 50000,
    });
    expect(bookingPaymentOf({ payment_status: "paid", amount_paid_paise: 49900, package_purchase_id: "p" })).toEqual({ kind: "unknown" });
  });

  it("only emails a cancellation for a session that was really booked", () => {
    expect(cancellationIsWorthEmailing({ payment_status: "unpaid" })).toBe(false);
    expect(cancellationIsWorthEmailing({ payment_status: "paid" })).toBe(true);
    expect(cancellationIsWorthEmailing({ payment_status: "unpaid", payment_terms: "pay_later" })).toBe(true);
    expect(cancellationIsWorthEmailing({ payment_status: "unpaid", home_visit_purchase_id: "h" })).toBe(true);
  });

  it("reads the refund the cancellation wrote", () => {
    expect(cancelRefundOf({ refund_status: "processed", refund_amount_paise: 49900 })).toEqual({ kind: "refunded", amountPaise: 49900 });
    expect(cancelRefundOf({ refund_status: "failed" })).toEqual({ kind: "refund_pending" });
    expect(cancelRefundOf({ refund_status: "manual_pending" })).toEqual({ kind: "refund_pending" });
    expect(cancelRefundOf({ refund_status: "not_eligible" })).toEqual({ kind: "not_refunded" });
    expect(cancelRefundOf({ package_purchase_id: "p" })).toEqual({ kind: "programme" });
    expect(cancelRefundOf({})).toEqual({ kind: "none_paid" });
  });

  it("reads the mode", () => {
    expect(sessionModeOf({ visit_mode: "home_visit" })).toBe("home_visit");
    expect(sessionModeOf({ visit_mode: null })).toBe("online");
  });
});

describe("reminders", () => {
  const H = 3_600_000;
  const now = Date.UTC(2026, 10, 20, 6, 0);
  const at = (hoursAhead: number) => now + hoursAhead * H;

  it("sends the day-before reminder between 25 and 18 hours ahead, for a session booked earlier", () => {
    const bookedAtMs = now - 3 * 24 * H;
    expect(dueReminder({ slotMs: at(24), nowMs: now, bookedAtMs })).toBe("reminder_24h");
    expect(dueReminder({ slotMs: at(25), nowMs: now, bookedAtMs })).toBe("reminder_24h");
    expect(dueReminder({ slotMs: at(18.5), nowMs: now, bookedAtMs })).toBe("reminder_24h");
    expect(dueReminder({ slotMs: at(26), nowMs: now, bookedAtMs })).toBeNull();
    expect(dueReminder({ slotMs: at(17), nowMs: now, bookedAtMs })).toBeNull();
  });

  it("skips the day-before reminder for a session booked inside that window", () => {
    expect(dueReminder({ slotMs: at(20), nowMs: now, bookedAtMs: now - H })).toBeNull();
  });

  it("sends the hour-before reminder between 90 and 15 minutes ahead, and nothing later", () => {
    expect(dueReminder({ slotMs: at(1), nowMs: now, bookedAtMs: null })).toBe("reminder_1h");
    expect(dueReminder({ slotMs: at(1.5), nowMs: now, bookedAtMs: null })).toBe("reminder_1h");
    expect(dueReminder({ slotMs: at(0.25), nowMs: now, bookedAtMs: null })).toBeNull();
    expect(dueReminder({ slotMs: at(-1), nowMs: now, bookedAtMs: null })).toBeNull();
    expect(dueReminder({ slotMs: at(3), nowMs: now, bookedAtMs: null })).toBeNull();
  });

  it("words each reminder for its moment, with no health details", () => {
    const tomorrow = bookingReminderEmail(brand, facts, "reminder_24h");
    expect(tomorrow.subject).toBe("Tomorrow: your video session on 24 Nov 2026, 6:00 pm IST");
    expect(tomorrow.text).toContain("is tomorrow");
    const soon = bookingReminderEmail(brand, { ...facts, mode: "home_visit" }, "reminder_1h");
    expect(soon.subject).toBe("Starting soon: your home visit at 24 Nov 2026, 6:00 pm IST");
    expect(soon.text).toContain("starts in about an hour");
    expect(soon.text).toContain("come to the address you gave");
  });
});
