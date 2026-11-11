import { describe, expect, it } from "vitest";
import { buildPatientReceipts, receiptReferences } from "./receipts";

describe("receiptReferences", () => {
  it("carries the Razorpay ids of a failed attempt, so pasting either finds it", () => {
    const receipts = buildPatientReceipts(
      [],
      [],
      [
        {
          id: "f1",
          patient_id: "p1",
          appointment_id: "a1",
          package_purchase_id: null,
          amount_paise: 50000,
          error_code: "BAD_REQUEST_ERROR",
          error_reason: "payment_failed",
          error_description: null,
          created_at: "2026-11-10T10:00:00Z",
          razorpay_payment_id: "pay_TqSITHLtez0T67",
          razorpay_order_id: "order_ABC123",
        },
      ],
      new Map()
    );
    const failed = receipts.find((r) => r.kind === "payment_failed");
    expect(failed && receiptReferences(failed)).toEqual(["pay_TqSITHLtez0T67", "order_ABC123"]);
  });

  it("has nothing to match when the gateway gave no id", () => {
    const [failed] = buildPatientReceipts(
      [],
      [],
      [
        {
          id: "f2",
          patient_id: "p1",
          appointment_id: "a1",
          package_purchase_id: null,
          amount_paise: null,
          error_code: null,
          error_reason: null,
          error_description: null,
          created_at: "2026-11-10T10:00:00Z",
        },
      ],
      new Map()
    );
    expect(receiptReferences(failed)).toEqual([]);
  });
});
