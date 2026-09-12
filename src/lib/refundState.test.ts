import { describe, it, expect } from "vitest";
import {
  describeRefund,
  describeRefundForPatient,
  hasRefund,
  isPartialRefund,
} from "@/lib/refundState";

describe("describeRefund", () => {
  it("says nothing for a session with no refund", () => {
    expect(describeRefund(null).state).toBe("none");
    expect(describeRefund({}).state).toBe("none");
    expect(describeRefund({ refund_status: null }).label).toBe("");
    expect(hasRefund({ refund_status: null })).toBe(false);
  });

  // "Refunded" alone leaves an admin opening the drawer to find out whether
  // it was all of it or some of it.
  it("names the amount that went back", () => {
    const r = describeRefund({ refund_status: "processed", refund_amount_paise: 120000 });
    expect(r.label).toBe("Refunded ₹1,200");
    expect(r.tone).toBe("good");
    expect(r.needsPerson).toBe(false);
  });

  it("still reads when the amount was never recorded", () => {
    expect(describeRefund({ refund_status: "processed" }).label).toBe("Refunded");
  });

  // The two that are work. A failure nobody displays is a failure nobody
  // acts on.
  it("marks the two states that are waiting on a person", () => {
    const manual = describeRefund({ refund_status: "manual_pending", refund_amount_paise: 50000 });
    expect(manual.label).toBe("Hand back ₹500");
    expect(manual.needsPerson).toBe(true);
    expect(manual.tone).toBe("warn");

    const failed = describeRefund({ refund_status: "failed" });
    expect(failed.needsPerson).toBe(true);
    expect(failed.tone).toBe("bad");
  });

  // "No refund due" and "we never looked" read identically when both are
  // blank, and they mean opposite things.
  it("distinguishes a decision that no money is owed from no decision", () => {
    expect(describeRefund({ refund_status: "not_eligible" }).label).toBe("No refund due");
    expect(describeRefund({ refund_status: "not_eligible" }).needsPerson).toBe(false);
    expect(describeRefund({}).label).toBe("");
  });

  it("carries the reason and the timestamp through", () => {
    const r = describeRefund({
      refund_status: "processed",
      refund_amount_paise: 10000,
      refund_reason: "  Cancelled by the clinic  ",
      refunded_at: "2026-09-12T12:30:00.000Z",
    });
    expect(r.reason).toBe("Cancelled by the clinic");
    expect(r.at).toBe("2026-09-12T12:30:00.000Z");
  });

  it("never invents a state for a status it has not seen", () => {
    expect(describeRefund({ refund_status: "something_new" }).state).toBe("none");
  });
});

describe("isPartialRefund", () => {
  it("is true only when less went back than came in", () => {
    const partial = { refund_status: "processed", refund_amount_paise: 50000 };
    expect(isPartialRefund(partial, 120000)).toBe(true);
    expect(isPartialRefund({ refund_status: "processed", refund_amount_paise: 120000 }, 120000)).toBe(
      false
    );
  });

  it("is false wherever the comparison would be meaningless", () => {
    expect(isPartialRefund({ refund_status: "manual_pending", refund_amount_paise: 1 }, 100)).toBe(
      false
    );
    expect(isPartialRefund({ refund_status: "processed" }, 100)).toBe(false);
    expect(isPartialRefund({ refund_status: "processed", refund_amount_paise: 50 }, 0)).toBe(false);
    expect(isPartialRefund({ refund_status: "processed", refund_amount_paise: 50 }, null)).toBe(
      false
    );
  });
});

describe("describeRefundForPatient", () => {
  it("names the amount that came back", () => {
    const r = describeRefundForPatient({ refund_status: "processed", refund_amount_paise: 120000 });
    expect(r.state).toBe("processed");
    expect(r.label).toBe("₹1,200 refunded");
  });

  it("reads a cash refund as a promise rather than a job", () => {
    const r = describeRefundForPatient({
      refund_status: "manual_pending",
      refund_amount_paise: 50000,
    });
    expect(r.label).toBe("₹500 coming back to you");
    // The admin reading of the same row is the clinic's work queue.
    expect(describeRefund({ refund_status: "manual_pending", refund_amount_paise: 50000 }).label).toBe(
      "Hand back ₹500"
    );
  });

  it("tells the patient what to do about a failed refund", () => {
    const r = describeRefundForPatient({ refund_status: "failed" });
    expect(r.state).toBe("failed");
    expect(r.label).toContain("contact us");
    expect(r.needsPerson).toBe(true);
  });

  it("says nothing at all when no refund was due", () => {
    // The admin chip states the decision; announcing "No refund due" to the
    // patient as a refund line would tell somebody about money they are not
    // getting, on a card that already explains the window.
    const r = describeRefundForPatient({ refund_status: "not_eligible" });
    expect(r.state).toBe("none");
    expect(r.label).toBe("");
  });

  it("carries the date and reason through untouched", () => {
    const r = describeRefundForPatient({
      refund_status: "processed",
      refund_amount_paise: 30000,
      refund_reason: "Session cut short by a connection failure.",
      refunded_at: "2026-09-04T10:00:00.000Z",
    });
    expect(r.at).toBe("2026-09-04T10:00:00.000Z");
    expect(r.reason).toBe("Session cut short by a connection failure.");
  });

  it("is silent on a row with no refund", () => {
    expect(describeRefundForPatient({ refund_status: null }).state).toBe("none");
    expect(describeRefundForPatient(undefined).state).toBe("none");
  });
});
