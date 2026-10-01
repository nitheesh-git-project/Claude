import { describe, it, expect } from "vitest";
import {
  clinicDateKey,
  clinicWeekKey,
  isSameClinicDay,
  isSameClinicWeek,
} from "./clinicWeek";

// Every case here is stated as a UTC instant and asserted against what the
// clinic (Asia/Kolkata, UTC+5:30) would call it. The whole point of the
// module is that those two disagree, so a test written in local time would
// pass for the wrong reason on a machine set to India.
describe("clinicDateKey", () => {
  it("puts an early-morning clinic instant on the clinic's day, not UTC's", () => {
    // 2026-03-02 00:30 IST is 2026-03-01 19:00 UTC -- a Sunday in UTC and a
    // Monday in the clinic.
    expect(clinicDateKey("2026-03-01T19:00:00Z")).toBe("2026-03-02");
  });

  it("agrees with UTC in the middle of the clinic's working day", () => {
    // 2026-03-02 17:30 IST is 2026-03-02 12:00 UTC.
    expect(clinicDateKey("2026-03-02T12:00:00Z")).toBe("2026-03-02");
  });

  it("keeps a late clinic evening on the same clinic day", () => {
    // 2026-03-02 23:30 IST is 2026-03-02 18:00 UTC.
    expect(clinicDateKey("2026-03-02T18:00:00Z")).toBe("2026-03-02");
  });
});

describe("clinicWeekKey", () => {
  it("separates a Sunday evening from the Monday morning after it", () => {
    // The case the UTC version got wrong. Sunday 2026-03-01 21:00 IST
    // (15:30 UTC) and Monday 2026-03-02 00:30 IST (2026-03-01 19:00 UTC)
    // are different clinic weeks; in UTC both are Sunday 1 March.
    const sundayEvening = "2026-03-01T15:30:00Z";
    const mondayMorning = "2026-03-01T19:00:00Z";
    expect(clinicWeekKey(sundayEvening)).not.toBe(clinicWeekKey(mondayMorning));
  });

  it("groups a clinic week's Monday and Sunday under one key", () => {
    // Monday 2026-03-02 10:00 IST and Sunday 2026-03-08 10:00 IST.
    expect(clinicWeekKey("2026-03-02T04:30:00Z")).toBe(
      clinicWeekKey("2026-03-08T04:30:00Z")
    );
  });

  it("starts a new key on the following Monday", () => {
    expect(clinicWeekKey("2026-03-08T04:30:00Z")).not.toBe(
      clinicWeekKey("2026-03-09T04:30:00Z")
    );
  });

  it("keeps a week that straddles the new year under one key", () => {
    // Thu 2026-12-31 and Fri 2027-01-01, both 10:00 IST. The Thursday rule
    // is what stops one clinic week becoming two keys.
    expect(clinicWeekKey("2026-12-31T04:30:00Z")).toBe(
      clinicWeekKey("2027-01-01T04:30:00Z")
    );
  });

  it("pads the week number so keys sort", () => {
    expect(clinicWeekKey("2026-01-05T04:30:00Z")).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("isSameClinicDay / isSameClinicWeek", () => {
  it("reads a midnight-crossing pair as two clinic days", () => {
    expect(isSameClinicDay("2026-03-02T18:00:00Z", "2026-03-02T19:00:00Z")).toBe(
      false
    );
  });

  it("reads two slots in one clinic week as one week", () => {
    expect(isSameClinicWeek("2026-03-02T04:30:00Z", "2026-03-05T04:30:00Z")).toBe(
      true
    );
  });
});
