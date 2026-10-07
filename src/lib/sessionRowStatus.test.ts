import { describe, expect, it } from "vitest";
import { sessionRowStatus } from "./sessionRowStatus";

describe("sessionRowStatus", () => {
  it("names each status in one word", () => {
    expect(sessionRowStatus("requested").label).toBe("Requested");
    expect(sessionRowStatus("confirmed").label).toBe("Confirmed");
    expect(sessionRowStatus("completed").label).toBe("Completed");
    expect(sessionRowStatus("cancelled").label).toBe("Cancelled");
  });

  it("says no-show rather than completed for a session nobody attended", () => {
    expect(sessionRowStatus("completed", true)).toEqual({ label: "No-show", tone: "warn" });
  });

  it("never prints a raw column value for an unexpected status", () => {
    expect(sessionRowStatus("pending_payment").label).toBe("Pending payment");
    expect(sessionRowStatus("").label).toBe("Unknown");
  });
});
