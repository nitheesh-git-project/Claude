import { describe, it, expect } from "vitest";
import { describeFailure, refundRefusalForAdmin } from "./refundAttempt";

// What the gateway said, in one line a person can read off a table. It is
// deliberately not the whole object: a Razorpay error carries the request
// back with it, and this column is read by every admin.
describe("describeFailure", () => {
  it("reads Razorpay's own description where there is one", () => {
    expect(
      describeFailure({ error: { description: "The amount is more than the refundable amount." } })
    ).toBe("The amount is more than the refundable amount.");
  });

  it("falls back to an ordinary Error's message", () => {
    expect(describeFailure(new Error("socket hang up"))).toBe("socket hang up");
  });

  it("takes a plain string as given", () => {
    expect(describeFailure("timed out")).toBe("timed out");
  });

  // Null rather than "undefined" or "[object Object]": a column nobody can
  // read is worse than an empty one, because it looks like a recorded fact.
  it("answers null rather than printing something unreadable", () => {
    expect(describeFailure(undefined)).toBeNull();
    expect(describeFailure(null)).toBeNull();
    expect(describeFailure({})).toBeNull();
    expect(describeFailure({ error: { description: 42 } })).toBeNull();
    expect(describeFailure("   ")).toBeNull();
  });

  it("keeps the status when Razorpay sends no body", () => {
    expect(describeFailure({ statusCode: 404, error: undefined })).toBe(
      "Razorpay answered 404: it has no such payment on this account"
    );
    expect(describeFailure({ statusCode: 500 })).toBe("Razorpay answered HTTP 500 with no reason");
  });

  // Bounded, because this is written on a failure path where the thing
  // thrown can be arbitrarily large.
  it("bounds what it stores", () => {
    expect(describeFailure("x".repeat(900))!.length).toBe(500);
  });
});

describe("refundRefusalForAdmin", () => {
  it("quotes Razorpay's own reason instead of 'check Razorpay'", () => {
    const msg = refundRefusalForAdmin({ error: { description: "The payment has been fully refunded already" } });
    expect(msg).toContain('"The payment has been fully refunded already."');
    expect(msg).toContain("Nothing was refunded");
  });

  it("names the balance as the cause and the next step when that is the refusal", () => {
    const msg = refundRefusalForAdmin({
      error: { description: "Your account does not have enough balance to carry out the refund operation." },
    });
    expect(msg).toContain("enough balance");
    expect(msg).toMatch(/Wait for the payment to settle or add funds/);
  });

  it("says no reason was given rather than inventing one", () => {
    expect(refundRefusalForAdmin(new Error(""))).toMatch(/gave no reason/);
    expect(refundRefusalForAdmin(null)).toMatch(/gave no reason/);
  });
});
