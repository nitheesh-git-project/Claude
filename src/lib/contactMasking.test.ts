import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, canRevealContact } from "@/lib/contactMasking";

const slot = Date.parse("2026-09-01T10:00:00Z");
const base = { slotTimeMs: slot, beforeMinutes: 15, afterMinutes: 15 };

describe("maskPhone", () => {
  it("keeps the country code and the last three digits", () => {
    expect(maskPhone("+919876543210").masked).toBe("+91 •••••••210");
    expect(maskPhone("9876543210").masked).toBe("•••••••210");
  });

  it("ignores the separators someone typed", () => {
    expect(maskPhone("+91 98765 43210").masked).toBe(maskPhone("+919876543210").masked);
  });

  it("masks a malformed entry whole rather than slicing it", () => {
    // Slicing a country code off a number that has none would expose real
    // digits as a prefix.
    expect(maskPhone("12").masked).toBe("•••");
    // Five digits, three shown, so two dots -- the mask never invents
    // digits that are not there.
    expect(maskPhone("+91123").masked).toBe("••123");
  });

  it("says when there is nothing to reveal", () => {
    expect(maskPhone(null)).toEqual({ masked: "No number on file", present: false });
    expect(maskPhone("")).toEqual({ masked: "No number on file", present: false });
  });

  it("never leaks a middle digit", () => {
    const masked = maskPhone("+919876543210").masked;
    expect(masked).not.toContain("9876543");
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("pooja.sharma@gmail.com").masked).toBe("p•••••••••••@gmail.com");
  });
  it("handles a missing or malformed address", () => {
    expect(maskEmail(null).present).toBe(false);
    expect(maskEmail("not-an-email").present).toBe(false);
  });
});

describe("canRevealContact", () => {
  it("allows a video session inside its join window", () => {
    const d = canRevealContact({ ...base, status: "confirmed", visitMode: "online", nowMs: slot - 5 * 60_000 });
    expect(d.allowed).toBe(true);
  });

  it("refuses a video session the day before", () => {
    const d = canRevealContact({ ...base, status: "confirmed", visitMode: "online", nowMs: slot - 86_400_000 });
    expect(d.allowed).toBe(false);
  });

  it("allows a home visit any time on its own day", () => {
    // Calling ahead from the wrong gate does not happen inside a
    // fifteen-minute window.
    const d = canRevealContact({ ...base, status: "confirmed", visitMode: "home_visit", nowMs: slot - 6 * 3600_000 });
    expect(d.allowed).toBe(true);
  });

  it("refuses a home visit a week later", () => {
    const d = canRevealContact({ ...base, status: "confirmed", visitMode: "home_visit", nowMs: slot + 7 * 86_400_000 });
    expect(d.allowed).toBe(false);
  });

  it("refuses a cancelled session outright, in either mode", () => {
    for (const visitMode of ["online", "home_visit"]) {
      const d = canRevealContact({ ...base, status: "cancelled", visitMode, nowMs: slot });
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.message).toContain("cancelled");
    }
  });

  it("honours an admin-widened window", () => {
    const wide = { ...base, beforeMinutes: 240, afterMinutes: 240 };
    const d = canRevealContact({ ...wide, status: "confirmed", visitMode: "online", nowMs: slot - 3 * 3600_000 });
    expect(d.allowed).toBe(true);
  });
});
