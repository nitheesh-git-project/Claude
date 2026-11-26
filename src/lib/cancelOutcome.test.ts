import { describe, expect, it } from "vitest";
import { cancelDialogMessage, describeCancelOutcome, hoursUntil, patientCancelMessage, type CancelOutcomeInput } from "./cancelOutcome";

const NOW = Date.parse("2026-06-01T06:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const base: CancelOutcomeInput = {
  slotTime: inHours(48),
  nowMs: NOW,
  windowHours: 24,
  paidDirect: true,
  viaProgramme: false,
  cashCollected: false,
  cashCollectedPaise: null,
  refundablePaise: 120000,
};

describe("describeCancelOutcome", () => {
  it("says the amount that goes back to the card", () => {
    const o = describeCancelOutcome(base);
    expect(o.kind).toBe("card_refund");
    expect(o.amountPaise).toBe(120000);
    expect(o.text).toBe("₹1,200 goes back to the patient's card.");
  });

  it("names the clinic's own window, not the 24 h constant", () => {
    const o = describeCancelOutcome({ ...base, slotTime: inHours(30), windowHours: 48 });
    expect(o.kind).toBe("card_late");
    expect(o.text).toBe("No refund - within 48 h of the slot.");
    expect(o.text).not.toContain("24");
  });

  it("is not late exactly at the window", () => {
    expect(describeCancelOutcome({ ...base, slotTime: inHours(24) }).kind).toBe("card_refund");
  });

  it("does not call a session with no readable slot late", () => {
    expect(describeCancelOutcome({ ...base, slotTime: null }).kind).toBe("card_refund");
    expect(hoursUntil("not a date", NOW)).toBeNull();
  });

  it("only offers what is left after earlier refunds", () => {
    const o = describeCancelOutcome({ ...base, refundablePaise: 50000 });
    expect(o.text).toBe("₹500 goes back to the patient's card.");
    expect(describeCancelOutcome({ ...base, refundablePaise: 0 }).kind).toBe("already_refunded");
  });

  it("moves no money for a programme session, and forfeits it when late", () => {
    const programme = { ...base, paidDirect: false, viaProgramme: true, refundablePaise: 0 };
    expect(describeCancelOutcome(programme).kind).toBe("credit_back");
    const late = describeCancelOutcome({ ...programme, slotTime: inHours(2) });
    expect(late.kind).toBe("credit_forfeited");
    expect(late.text).toContain("within 24 h of the slot");
  });

  it("hands collected cash back unless the cancellation is late", () => {
    const visit = { ...base, paidDirect: false, viaProgramme: true, cashCollected: true, cashCollectedPaise: 80000 };
    const back = describeCancelOutcome(visit);
    expect(back.kind).toBe("cash_hand_back");
    expect(back.amountPaise).toBe(80000);
    expect(back.text).toContain("₹800");
    expect(describeCancelOutcome({ ...visit, slotTime: inHours(1) }).kind).toBe("cash_late");
  });

  it("says nothing is owed on an unpaid session", () => {
    const o = describeCancelOutcome({ ...base, paidDirect: false, refundablePaise: 0 });
    expect(o.kind).toBe("unpaid");
    expect(cancelDialogMessage(o)).toContain("nothing to refund");
  });
});

describe("patientCancelMessage", () => {
  const unpaid = { ...base, paidDirect: false, viaProgramme: false, refundablePaise: 0 };

  it("tells a pay-later patient nothing is owed, even inside the window", () => {
    const m = patientCancelMessage({ ...unpaid, slotTime: inHours(2), payLater: true });
    expect(m).toContain("nothing is owed");
    expect(m).not.toContain("won't be refunded");
  });

  it("tells an unpaid patient there is nothing to refund", () => {
    expect(patientCancelMessage({ ...unpaid, payLater: false })).toContain("You haven't paid");
  });

  it("names the refund for a paid session outside the window, and the window inside it", () => {
    const paid = { ...base, paidDirect: true, refundablePaise: 49_900, payLater: false };
    expect(patientCancelMessage({ ...paid, slotTime: inHours(30) })).toContain("₹499 will be refunded");
    expect(patientCancelMessage({ ...paid, slotTime: inHours(5) })).toContain("within 24 hours of your session, so it won't be refunded");
  });

  it("uses the clinic's own window, not a fixed 24 hours", () => {
    const paid = { ...base, paidDirect: true, refundablePaise: 49_900, payLater: false, windowHours: 48 };
    expect(patientCancelMessage({ ...paid, slotTime: inHours(30) })).toContain("within 48 hours");
  });

  it("gives a programme session back, or says it is used up", () => {
    const prog = { ...unpaid, viaProgramme: true, payLater: false };
    expect(patientCancelMessage({ ...prog, slotTime: inHours(30) })).toContain("goes back to your programme");
    expect(patientCancelMessage({ ...prog, slotTime: inHours(5) })).toContain("used up");
  });
});
