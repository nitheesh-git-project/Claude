import { describe, it, expect } from "vitest";
import {
  describeSessionPayment,
  describeSessionPaymentForPatient,
  isPayLaterSession,
  type SessionPaymentRow,
} from "./sessionPaymentState";

const prepaid = (over: Partial<SessionPaymentRow> = {}): SessionPaymentRow => ({
  status: "confirmed",
  payment_status: "unpaid",
  payment_terms: "prepaid",
  ...over,
});

const terms = (over: Partial<SessionPaymentRow> = {}): SessionPaymentRow => ({
  status: "confirmed",
  payment_status: "unpaid",
  payment_terms: "pay_later",
  ...over,
});

describe("isPayLaterSession", () => {
  it("is true only for the one value", () => {
    expect(isPayLaterSession({ payment_terms: "pay_later" })).toBe(true);
    expect(isPayLaterSession({ payment_terms: "prepaid" })).toBe(false);
    expect(isPayLaterSession({})).toBe(false);
    expect(isPayLaterSession({ payment_terms: null })).toBe(false);
  });
});

describe("describeSessionPayment - ordinary sessions", () => {
  // The whole point of the module is that these do not move. Every existing
  // row carries `prepaid`, so a change here would be a change to every
  // session in the database.
  it("reads a paid session as paid", () => {
    const d = describeSessionPayment(prepaid({ payment_status: "paid" }));
    expect(d).toMatchObject({ state: "paid", label: "Paid", owed: false, onTerms: false });
  });

  it("reads an abandoned checkout as unpaid", () => {
    expect(describeSessionPayment(prepaid()).label).toBe("Unpaid");
  });

  it("reads a failed payment as its own state", () => {
    expect(describeSessionPayment(prepaid({ payment_status: "failed" })).state).toBe("failed");
  });

  // A select that did not ask for `payment_terms` must describe an ordinary
  // session rather than guess -- the same rule meetSyncState follows.
  it("treats an unloaded column as an ordinary session", () => {
    expect(describeSessionPayment({ payment_status: "paid" }).state).toBe("paid");
    expect(describeSessionPayment({ payment_status: "unpaid" }).label).toBe("Unpaid");
  });
});

describe("describeSessionPayment - on terms", () => {
  // Nothing is owed until the work is done. This is the single split the
  // whole arrangement rests on.
  it("owes nothing before the session is delivered", () => {
    const d = describeSessionPayment(terms({ status: "confirmed" }));
    expect(d).toMatchObject({ state: "pay_later_pending", label: "Pay later", owed: false });
  });

  it("owes once the session is completed", () => {
    const d = describeSessionPayment(terms({ status: "completed" }));
    expect(d).toMatchObject({ state: "pay_later_open", label: "Owed", owed: true });
  });

  // No special case needed: a cancellation never reached `completed`, so it
  // falls through to the same branch a booking does.
  it("owes nothing on a late cancellation", () => {
    expect(describeSessionPayment(terms({ status: "cancelled" })).owed).toBe(false);
  });

  it("reads a settled session as settled, not as paid", () => {
    const d = describeSessionPayment(terms({ status: "completed", payment_status: "paid" }));
    expect(d).toMatchObject({ state: "pay_later_closed", label: "Settled", owed: false });
  });

  it("stops owing once written off", () => {
    const d = describeSessionPayment(
      terms({ status: "completed", pay_later_outcome: "written_off" })
    );
    expect(d).toMatchObject({ label: "Written off", owed: false });
  });

  // The bug this module exists to prevent: a trusted patient's delivered
  // session printed as "Unpaid" beside an abandoned checkout saying the same
  // word, on a screen somebody chases people from.
  it("never calls a session on terms 'Unpaid'", () => {
    for (const status of ["requested", "confirmed", "completed", "cancelled", "no_show"]) {
      expect(describeSessionPayment(terms({ status })).label).not.toBe("Unpaid");
    }
  });

  it("marks every one of them as on terms", () => {
    for (const status of ["requested", "confirmed", "completed", "cancelled"]) {
      expect(describeSessionPayment(terms({ status })).onTerms).toBe(true);
    }
  });
});

describe("describeSessionPaymentForPatient", () => {
  it("never tells the patient their debt was written off", () => {
    const row = terms({ status: "completed", pay_later_outcome: "written_off" });
    // The admin needs the accounting word. The patient needs to know there is
    // nothing to do -- being told the clinic stopped chasing them is a
    // decision about them, taken without them.
    expect(describeSessionPayment(row).label).toBe("Written off");
    expect(describeSessionPaymentForPatient(row)!.label).toBe("Nothing to pay");
    expect(describeSessionPaymentForPatient(row)!.tone).toBe("good");
  });

  it("says nothing at all on a cancelled session", () => {
    // The cancelled card already explains itself; a payment chip beside it
    // announces an arrangement that never came into play. Same rule as
    // `not_eligible` saying nothing on a refund.
    expect(describeSessionPaymentForPatient(terms({ status: "cancelled" }))).toBeNull();
  });

  it("reads the same as the admin chip everywhere the two agree", () => {
    for (const row of [
      terms({ status: "completed" }),
      terms({ status: "confirmed" }),
      terms({ status: "completed", payment_status: "paid" }),
      prepaid(),
      prepaid({ payment_status: "paid" }),
      prepaid({ status: "cancelled" }),
    ]) {
      expect(describeSessionPaymentForPatient(row)).toEqual(describeSessionPayment(row));
    }
  });
});
