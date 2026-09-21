import { describe, it, expect } from "vitest";
import {
  decideWriteOff,
  decideReverseWriteOff,
  writeOffRefusalMessage,
  reverseRefusalMessage,
  writeOffDescription,
  WRITE_OFF_REASON_MIN_CHARS,
  type WriteOffCandidate,
} from "./payLaterWriteOff";

const owed = (over: Partial<WriteOffCandidate> = {}): WriteOffCandidate => ({
  status: "completed",
  payment_status: "unpaid",
  payment_terms: "pay_later",
  amount_due_paise: 120000,
  pay_later_outcome: null,
  ...over,
});

describe("decideWriteOff", () => {
  it("allows a delivered, unsettled session on terms, at its frozen price", () => {
    expect(decideWriteOff(owed())).toEqual({ allowed: true, amountPaise: 120000 });
  });

  it("refuses a prepaid session, whatever else is true of it", () => {
    expect(decideWriteOff(owed({ payment_terms: "prepaid" }))).toEqual({
      allowed: false,
      reason: "not_pay_later",
    });
    // A row predating the column reads as prepaid, not as a candidate.
    expect(decideWriteOff(owed({ payment_terms: null }))).toEqual({
      allowed: false,
      reason: "not_pay_later",
    });
  });

  it("refuses a session that has not been delivered - nothing is owed yet", () => {
    for (const status of ["requested", "confirmed", "cancelled"]) {
      expect(decideWriteOff(owed({ status }))).toEqual({
        allowed: false,
        reason: "not_completed",
      });
    }
  });

  it("refuses a settled session, by either of the two things that say so", () => {
    expect(decideWriteOff(owed({ pay_later_outcome: "settled" }))).toEqual({
      allowed: false,
      reason: "already_settled",
    });
    expect(decideWriteOff(owed({ payment_status: "paid" }))).toEqual({
      allowed: false,
      reason: "already_settled",
    });
  });

  it("refuses one already written off, and says so rather than saying settled", () => {
    expect(decideWriteOff(owed({ pay_later_outcome: "written_off" }))).toEqual({
      allowed: false,
      reason: "already_written_off",
    });
  });

  it("refuses a session with no frozen price rather than guessing the standard fee", () => {
    expect(decideWriteOff(owed({ amount_due_paise: null }))).toEqual({
      allowed: false,
      reason: "no_frozen_price",
    });
    expect(decideWriteOff(owed({ amount_due_paise: 0 }))).toEqual({
      allowed: false,
      reason: "no_frozen_price",
    });
  });

  it("checks the session's own state before its price, so the message is the useful one", () => {
    // A prepaid session with no amount is told it is prepaid: being told it
    // has no agreed price would send an admin to fix a field that is not the
    // reason they are refused.
    expect(decideWriteOff(owed({ payment_terms: "prepaid", amount_due_paise: null }))).toEqual({
      allowed: false,
      reason: "not_pay_later",
    });
  });
});

describe("decideReverseWriteOff", () => {
  it("allows a written-off session back", () => {
    expect(decideReverseWriteOff(owed({ pay_later_outcome: "written_off" }))).toEqual({
      allowed: true,
    });
  });

  it("refuses anything else", () => {
    expect(decideReverseWriteOff(owed())).toEqual({
      allowed: false,
      reason: "not_written_off",
    });
    expect(decideReverseWriteOff(owed({ pay_later_outcome: "settled" }))).toEqual({
      allowed: false,
      reason: "not_written_off",
    });
  });
});

describe("the sentences", () => {
  it("gives every refusal a message, and none of them is a bare no", () => {
    const reasons = [
      "not_pay_later",
      "not_completed",
      "already_settled",
      "already_written_off",
      "no_frozen_price",
    ] as const;
    for (const reason of reasons) {
      const message = writeOffRefusalMessage(reason);
      expect(message.length).toBeGreaterThan(20);
      expect(message.endsWith(".")).toBe(true);
    }
    expect(reverseRefusalMessage("not_written_off").length).toBeGreaterThan(20);
  });

  it("carries no figures, so a changed floor cannot make a message wrong", () => {
    expect(writeOffRefusalMessage("no_frozen_price")).not.toMatch(/\d/);
    expect(WRITE_OFF_REASON_MIN_CHARS).toBe(10);
  });
});

describe("writeOffDescription", () => {
  it("names the patient, the session and why, for whoever reads the Costs screen", () => {
    expect(
      writeOffDescription({
        patientName: "Lakshmi",
        sessionCode: "SN-0042",
        reason: "Stopped answering after moving away",
      })
    ).toBe("Written off: session for Lakshmi (SN-0042) - Stopped answering after moving away");
  });

  it("degrades rather than printing an empty bracket or the word null", () => {
    expect(
      writeOffDescription({ patientName: null, sessionCode: null, reason: "No longer contactable" })
    ).toBe("Written off: session for a patient - No longer contactable");
    expect(
      writeOffDescription({ patientName: "  ", sessionCode: "  ", reason: " Hardship agreed " })
    ).toBe("Written off: session for a patient - Hardship agreed");
  });
});
