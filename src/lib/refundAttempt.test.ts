import { describe, it, expect } from "vitest";
import { describeFailure } from "./refundAttempt";

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

  // Bounded, because this is written on a failure path where the thing
  // thrown can be arbitrarily large.
  it("bounds what it stores", () => {
    expect(describeFailure("x".repeat(900))!.length).toBe(500);
  });
});
