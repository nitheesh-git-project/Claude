import { describe, expect, it } from "vitest";
import {
  DELETE_REASONS,
  deleteReasonLabel,
  placeholderEmail,
  recordsSnapshot,
  summariseMoneyRecords,
  validateDeleteReason,
  type MoneyRecord,
} from "./accountDeletionRecords";

describe("validateDeleteReason", () => {
  it("needs one of the listed reasons", () => {
    expect(validateDeleteReason(undefined, "")).toEqual({ ok: false, error: "Choose why this account is being deleted." });
    expect(validateDeleteReason("because", "")).toMatchObject({ ok: false });
    expect(validateDeleteReason("duplicate", "  ")).toEqual({ ok: true, reason: "duplicate", note: null });
  });

  it("needs a note when the reason is Other, and keeps notes short", () => {
    expect(validateDeleteReason("other", "")).toMatchObject({ ok: false });
    expect(validateDeleteReason("other", "Moved abroad")).toEqual({ ok: true, reason: "other", note: "Moved abroad" });
    expect(validateDeleteReason("fraud", "x".repeat(1001))).toMatchObject({ ok: false });
  });

  it("matches the database's list exactly", () => {
    expect(DELETE_REASONS.map((r) => r.key)).toEqual(["duplicate", "user_request", "fraud", "left_clinic", "test_account", "other"]);
    expect(deleteReasonLabel("other")).toBe("Other");
    expect(deleteReasonLabel("user_request")).toBe("The person asked to be removed");
    expect(deleteReasonLabel(null)).toBe("Not recorded");
  });
});

describe("placeholderEmail", () => {
  it("is on the reserved .invalid domain and unique per account", () => {
    const a = placeholderEmail("6f1c2d3e-0000-4000-8000-000000000001");
    expect(a).toBe("deleted.6f1c2d3e0000@deleted.invalid");
    expect(placeholderEmail("7f1c2d3e-0000-4000-8000-000000000001")).not.toBe(a);
  });
});

describe("summariseMoneyRecords", () => {
  const r = (kind: MoneyRecord["kind"], amountPaise: number, at: string): MoneyRecord => ({
    kind,
    label: kind,
    amountPaise,
    status: null,
    at,
    reference: null,
  });

  it("groups by kind in a fixed order with integer paise totals, newest first", () => {
    const s = summariseMoneyRecords([
      r("payout", 50000, "2026-03-01"),
      r("payment", 99900, "2026-01-01"),
      r("payment", 120000, "2026-02-01"),
    ]);
    expect(s.count).toBe(3);
    expect(s.byKind).toEqual([
      { kind: "payment", label: "Payment", count: 2, amountPaise: 219900 },
      { kind: "payout", label: "Payout to therapist", count: 1, amountPaise: 50000 },
    ]);
    expect(s.records.map((x) => x.at)).toEqual(["2026-02-01", "2026-01-01", "2026-03-01"]);
    expect(recordsSnapshot(s, { sessions: 4 })).toEqual({
      money: [
        { kind: "payment", count: 2, amountPaise: 219900 },
        { kind: "payout", count: 1, amountPaise: 50000 },
      ],
      other: { sessions: 4 },
    });
  });

  it("is empty for an account with no money", () => {
    expect(summariseMoneyRecords([])).toEqual({ records: [], byKind: [], count: 0 });
  });
});
