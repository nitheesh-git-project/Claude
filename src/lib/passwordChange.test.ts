import { describe, expect, it } from "vitest";
import { validatePasswordChange } from "@/lib/passwordChange";

describe("validatePasswordChange", () => {
  it("needs the current password and a new one that is long enough and different", () => {
    expect(validatePasswordChange("", "abcdef")).toMatchObject({ ok: false, field: "current" });
    expect(validatePasswordChange(undefined, "abcdef")).toMatchObject({ ok: false, field: "current" });
    expect(validatePasswordChange("old-pass", "abc")).toMatchObject({ ok: false, field: "next" });
    expect(validatePasswordChange("old-pass", "x".repeat(73))).toMatchObject({ ok: false, field: "next" });
    expect(validatePasswordChange("same-one", "same-one")).toMatchObject({ ok: false, field: "next" });
    expect(validatePasswordChange("old-pass", "new-pass")).toEqual({ ok: true, current: "old-pass", next: "new-pass" });
  });
});
