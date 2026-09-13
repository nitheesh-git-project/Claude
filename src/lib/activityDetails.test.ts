import { describe, it, expect } from "vitest";
import {
  humaniseKey,
  humaniseValue,
  isFirstValue,
  readableDetails,
} from "@/lib/activityDetails";

describe("readableDetails", () => {
  it("has nothing to say about an entry with no details", () => {
    expect(readableDetails(null)).toEqual({ changes: [], facts: [] });
    expect(readableDetails({})).toEqual({ changes: [], facts: [] });
  });

  // Five naming habits exist across the admin routes because each was
  // written where it was needed. Recognising all five here beats rewriting
  // twenty routes to agree, and a route following any of them gets a
  // readable change row without knowing this module exists.
  it("pairs a before and an after however the route named them", () => {
    expect(readableDetails({ fromPercent: 40, toPercent: 55 }).changes).toEqual([
      { label: "Percent", from: "40%", to: "55%" },
    ]);
    expect(
      readableDetails({ oldExpiresAt: "2026-01-01", newExpiresAt: "2026-03-01" }).changes[0]
        .label
    ).toBe("Expires at");
    expect(readableDetails({ from: "full", to: "operations" }).changes).toEqual([
      { label: "To", from: "full", to: "operations" },
    ]);
    expect(
      readableDetails({ previousEnabled: false, enabled: true }).changes
    ).toEqual([{ label: "Enabled", from: "No", to: "Yes" }]);
    expect(readableDetails({ before: "9 AM–1 PM", after: "9 AM–6 PM" }).changes).toEqual([
      { label: "After", from: "9 AM–1 PM", to: "9 AM–6 PM" },
    ]);
  });

  // `fromage` is not `from` + `age`. Without the camelCase boundary check a
  // field could be split into a change that never happened.
  it("only splits on a real word boundary", () => {
    const { changes, facts } = readableDetails({ fromage: "brie", age: 3 });
    expect(changes).toHaveLength(0);
    expect(facts.map((f) => f.label)).toEqual(["Fromage", "Age"]);
  });

  // An audit record's unrecognised field is exactly the one somebody is
  // looking for, so nothing may be dropped on the way to the screen.
  it("lists every key it did not pair, and drops none", () => {
    const { changes, facts } = readableDetails({
      previousPaise: 249900,
      amountPaise: 200000,
      reason: "Patient short ₹649 at the door",
      appointmentId: "a-1",
    });
    expect(changes).toEqual([{ label: "Amount", from: "₹2,499", to: "₹2,000" }]);
    expect(facts).toEqual([
      { label: "Reason", value: "Patient short ₹649 at the door" },
      { label: "Appointment ID", value: "a-1" },
    ]);
  });

  it("keeps the route's own order rather than sorting", () => {
    const { facts } = readableDetails({ zebra: 1, apple: 2 });
    expect(facts.map((f) => f.label)).toEqual(["Zebra", "Apple"]);
  });

  it("does not pair a before-key whose after is missing", () => {
    const { changes, facts } = readableDetails({ previousStatus: "cancelled" });
    expect(changes).toHaveLength(0);
    // Named as the route named it: calling a lone `previousStatus` "Status"
    // would read as the current one.
    expect(facts).toEqual([{ label: "Previous status", value: "cancelled" }]);
  });
});

describe("humaniseValue", () => {
  // "Paise" on screen is a storage detail nobody outside the code should
  // meet, and a rupee figure printed as 249900 is a wrong number.
  it("prints money as rupees and percentages as percentages", () => {
    expect(humaniseValue("amountPaise", 249900)).toBe("₹2,499");
    expect(humaniseValue("sharePercent", 55)).toBe("55%");
    expect(humaniseValue("count", 3)).toBe("3");
  });

  it("prints a date as a date, in the clinic's timezone", () => {
    expect(humaniseValue("incurredOn", "2026-09-11")).toContain("Sep");
    // The clinic reads IST, so a 06:30 UTC stamp is noon the same day.
    expect(humaniseValue("expiresAt", "2026-09-11T06:30:00Z")).toMatch(/2026, 12:00/);
  });

  it("says Yes and No rather than true and false", () => {
    expect(humaniseValue("enabled", true)).toBe("Yes");
    expect(humaniseValue("enabled", false)).toBe("No");
  });

  // A dash, not "null": an audit reader should not have to know what an
  // empty column looks like in JSON.
  it("prints an absent value as a dash", () => {
    expect(humaniseValue("reason", null)).toBe("-");
    expect(humaniseValue("reason", undefined)).toBe("-");
    expect(humaniseValue("reason", "")).toBe("-");
  });

  it("reads a list as a list, and an empty one as none", () => {
    expect(humaniseValue("sections", ["money", "catalog"])).toBe("money, catalog");
    expect(humaniseValue("sections", [])).toBe("none");
  });

  it("falls back to compact JSON for a shape it cannot know", () => {
    expect(humaniseValue("config", { threshold: 3 })).toBe('{"threshold":3}');
  });
});

describe("humaniseKey", () => {
  it("turns a column name into words", () => {
    expect(humaniseKey("amountPaise")).toBe("Amount");
    expect(humaniseKey("incurred_on")).toBe("Incurred on");
    expect(humaniseKey("therapistId")).toBe("Therapist ID");
    expect(humaniseKey("previousStatus")).toBe("Previous status");
  });
});

describe("isFirstValue", () => {
  it("knows a value appearing for the first time from one that changed", () => {
    expect(isFirstValue({ label: "Share", from: "-", to: "55%" })).toBe(true);
    expect(isFirstValue({ label: "Share", from: null, to: "55%" })).toBe(true);
    expect(isFirstValue({ label: "Share", from: "40%", to: "55%" })).toBe(false);
  });
});
