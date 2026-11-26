import { describe, it, expect } from "vitest";
import { autoAssignReadiness, therapistsWithHours } from "./autoAssignReadiness";

describe("auto-assign readiness", () => {
  it("counts approved, active therapists who have weekly hours", () => {
    const therapists = [
      { id: "a", approved: true, active: true },
      { id: "b", approved: false, active: true },
      { id: "c", approved: true, active: false },
      { id: "d", approved: true, active: true },
    ];
    const rows = [{ therapist_id: "a" }, { therapist_id: "a" }, { therapist_id: "b" }, { therapist_id: "c" }];
    expect(therapistsWithHours(therapists, rows)).toBe(1);
  });

  it("is ready at three", () => {
    expect(autoAssignReadiness(2).ready).toBe(false);
    expect(autoAssignReadiness(2).message).toMatch(/^2 therapists have weekly hours set\. We suggest/);
    expect(autoAssignReadiness(1).message).toMatch(/^1 therapist has/);
    expect(autoAssignReadiness(3)).toEqual({ ready: true, message: "3 therapists have weekly hours set - enough for this to help." });
  });
});
