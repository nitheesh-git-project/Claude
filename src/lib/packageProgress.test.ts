import { describe, expect, it } from "vitest";
import { computePackageExpiryState, patientExpiryNotice } from "./packageProgress";

const DAY = 86_400_000;
// 1 Nov 2026, 10:00 IST.
const NOW = Date.parse("2026-11-01T04:30:00Z");

describe("computePackageExpiryState", () => {
  it("reads no expiry, active, expiring soon and expired", () => {
    expect(computePackageExpiryState(null, NOW, 7)).toBe("no_expiry");
    expect(computePackageExpiryState(new Date(NOW + 30 * DAY).toISOString(), NOW, 7)).toBe("active");
    expect(computePackageExpiryState(new Date(NOW + 3 * DAY).toISOString(), NOW, 7)).toBe("expiring_soon");
    expect(computePackageExpiryState(new Date(NOW - DAY).toISOString(), NOW, 7)).toBe("expired");
  });
});

describe("patientExpiryNotice", () => {
  it("says nothing while the programme is comfortably in date", () => {
    expect(patientExpiryNotice(new Date(NOW + 60 * DAY).toISOString(), 4, NOW, 7)).toBeNull();
  });

  it("says nothing for a programme with no expiry", () => {
    expect(patientExpiryNotice(null, 4, NOW, 7)).toBeNull();
  });

  it("names what is left and the date, never a count of days, near the end", () => {
    // 12 Nov 2026 in the clinic's zone.
    const expires = "2026-11-12T12:00:00Z";
    const notice = patientExpiryNotice(expires, 3, Date.parse("2026-11-08T04:30:00Z"), 7);
    expect(notice).toBe("3 sessions left - book by 12 Nov");
    expect(notice).not.toMatch(/days?\b/);
  });

  it("uses the singular and the visit noun", () => {
    const expires = new Date(NOW + 2 * DAY).toISOString();
    expect(patientExpiryNotice(expires, 1, NOW, 7, "visit")).toMatch(/^1 visit left - book by /);
  });

  it("says nothing once everything is booked", () => {
    expect(patientExpiryNotice(new Date(NOW + 2 * DAY).toISOString(), 0, NOW, 7)).toBeNull();
  });

  it("says nothing once it has expired - the card's status says that", () => {
    expect(patientExpiryNotice(new Date(NOW - DAY).toISOString(), 3, NOW, 7)).toBeNull();
  });

  it("formats the date in the clinic's zone, not the runtime's", () => {
    // 23:30 UTC on 11 Nov is 05:00 IST on 12 Nov.
    expect(patientExpiryNotice("2026-11-11T23:30:00Z", 2, NOW + 8 * DAY, 7)).toBe(
      "2 sessions left - book by 12 Nov"
    );
  });
});
