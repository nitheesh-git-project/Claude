import { describe, expect, it } from "vitest";
import {
  TEST_ACCOUNT_SET,
  TEST_CARD_FIELDS,
  batchTag,
  credentialsText,
  groupTestAccounts,
  isRazorpayTestKey,
  testAccountEmail,
  testAccountLoginPath,
  testAccountName,
  testAccountPassword,
  testCardText,
  type TestAccountRow,
} from "./debugTestAccounts";

const fixed = (v: number) => () => v;

describe("TEST_ACCOUNT_SET", () => {
  it("is one of every role and each admin desk, never a Master Admin", () => {
    expect(TEST_ACCOUNT_SET.map((p) => p.role)).toEqual(["patient", "therapist", "hospital", "admin", "admin", "admin"]);
    expect(TEST_ACCOUNT_SET.filter((p) => p.role === "admin").map((p) => p.adminScope)).toEqual([
      "operations",
      "finance",
      "clinical",
    ]);
    expect(TEST_ACCOUNT_SET.some((p) => (p.adminScope as string | null) === "full")).toBe(false);
  });
});

describe("test logins", () => {
  it("builds a readable email, name and password on the reserved .test domain", () => {
    const tag = batchTag(fixed(0));
    expect(tag).toMatch(/^[a-z2-9]{5}$/);
    const plan = TEST_ACCOUNT_SET[0];
    expect(testAccountEmail(plan, "k7q2m")).toBe("test.patient.k7q2m@moverestore.test");
    expect(testAccountName(plan, "k7q2m")).toBe("Test Patient K7Q2M");
    const pw = testAccountPassword("k7q2m", fixed(0.5));
    expect(pw).toMatch(/^Test-K7Q2M-\d{4}$/);
    expect(credentialsText("a@b.test", pw)).toBe(`a@b.test\n${pw}`);
  });

  it("sends each role to its own login page", () => {
    expect(testAccountLoginPath("patient")).toBe("/patient/login");
    expect(testAccountLoginPath("therapist")).toBe("/therapist/login");
    expect(testAccountLoginPath("hospital")).toBe("/hospital/login");
    expect(testAccountLoginPath("admin")).toBe("/admin/login");
  });

  it("groups by set, newest first, in the panel's order", () => {
    const row = (batch: string, label: string, at: string): TestAccountRow => ({
      user_id: `${batch}-${label}`,
      batch_id: batch,
      role: "patient",
      admin_scope: null,
      label,
      email: "",
      password: "",
      created_at: at,
    });
    const groups = groupTestAccounts([
      row("old", "Therapist", "2026-01-01T00:00:00Z"),
      row("new", "Finance admin", "2026-02-01T00:00:01Z"),
      row("new", "Patient", "2026-02-01T00:00:00Z"),
      row("old", "Patient", "2026-01-01T00:00:00Z"),
    ]);
    expect(groups.map((g) => g.batchId)).toEqual(["new", "old"]);
    expect(groups[0].accounts.map((a) => a.label)).toEqual(["Patient", "Finance admin"]);
    expect(groups[1].accounts.map((a) => a.label)).toEqual(["Patient", "Therapist"]);
  });
});

describe("the test card", () => {
  it("copies the number without spaces and lists every value", () => {
    expect(TEST_CARD_FIELDS.find((f) => f.key === "number")?.copy).toBe("5267318187975449");
    expect(TEST_CARD_FIELDS.map((f) => f.copy).slice(1)).toEqual(["12/29", "123", "1111"]);
    expect(testCardText()).toContain("5267 3181 8797 5449");
  });

  it("is offered only against a Razorpay test key", () => {
    expect(isRazorpayTestKey("rzp_test_abc")).toBe(true);
    expect(isRazorpayTestKey("rzp_live_abc")).toBe(false);
    expect(isRazorpayTestKey(undefined)).toBe(false);
  });
});
