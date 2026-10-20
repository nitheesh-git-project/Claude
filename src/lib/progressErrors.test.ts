import { describe, expect, it } from "vitest";
import { progressErrorMessage } from "@/lib/progressErrors";

describe("progressErrorMessage", () => {
  it("gives every documented code its own sentence, whatever the status", () => {
    const codes = [
      "stale",
      "active_goal_exists",
      "session_not_started",
      "no_condition_profile",
      "proof_required",
      "milestone_reached",
      "goal_not_active",
      "not_reached",
      "reason_required",
    ];
    const seen = new Set<string>();
    for (const code of codes) {
      const message = progressErrorMessage({ status: 409, code, error: "ignored" }, "milestone");
      expect(message).not.toBe("ignored");
      seen.add(message);
    }
    expect(seen.size).toBe(codes.length);
  });

  it("tells a stale write to reload", () => {
    expect(progressErrorMessage({ status: 409, code: "stale" }, "goal")).toMatch(/Reload/);
  });

  it("never words a 503 as a refusal", () => {
    const message = progressErrorMessage({ status: 503 }, "measurement");
    expect(message).toMatch(/couldn't check/);
    expect(message).toMatch(/nothing was saved/);
    expect(message.toLowerCase()).not.toContain("not allowed");
    expect(progressErrorMessage({ status: 503, error: "We couldn't read this goal just now. Please try again." }, "goal")).toBe(
      "We couldn't read this goal just now. Please try again."
    );
  });

  it("does not call a rate limit a no", () => {
    const message = progressErrorMessage({ status: 429 }, "measurement");
    expect(message).toMatch(/Wait/);
    expect(message.toLowerCase()).not.toContain("not allowed");
  });

  it("asks for a sign-in on 401", () => {
    expect(progressErrorMessage({ status: 401 }, "goal")).toMatch(/Sign in/);
  });

  it("uses the route's own sentence for a plain 400, 403 and 404, with fallbacks", () => {
    expect(progressErrorMessage({ status: 400, error: "Walking aid must be text." }, "measurement")).toBe("Walking aid must be text.");
    expect(progressErrorMessage({ status: 403, error: "You can only record measurements for a patient you've been assigned to." }, "measurement")).toMatch(
      /assigned/
    );
    expect(progressErrorMessage({ status: 403 }, "reopen")).toMatch(/reopen this milestone/);
    expect(progressErrorMessage({ status: 404 }, "goal")).toMatch(/Reload/);
    expect(progressErrorMessage({ status: 400, error: "   " }, "goal")).toMatch(/Check what you entered/);
  });

  it("treats any other status as ours", () => {
    expect(progressErrorMessage({ status: 500 }, "goal")).toMatch(/our side/);
    expect(progressErrorMessage({ status: 502 }, "goal")).toMatch(/nothing was saved/);
  });
});
