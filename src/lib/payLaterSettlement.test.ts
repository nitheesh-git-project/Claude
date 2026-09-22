import { describe, it, expect } from "vitest";
import {
  DECLARABLE_METHODS,
  SETTLEMENT_METHODS,
  SETTLEMENT_METHOD_LABELS,
  decidePayLaterDeclaration,
  declarationRefusalMessage,
  isStaleSettlement,
  isSettlementMethod,
  pendingSettlements,
  reconcileSettlements,
  settlementWaitDays,
  type PayLaterDeclarationInput,
  type SettlementRow,
} from "./payLaterSettlement";

const ok = (over: Partial<PayLaterDeclarationInput> = {}): PayLaterDeclarationInput => ({
  featureEnabled: true,
  owedPaise: 480000,
  amountPaise: 480000,
  hasPending: false,
  ...over,
});

describe("decidePayLaterDeclaration", () => {
  it("allows a patient to declare what they owe", () => {
    expect(decidePayLaterDeclaration(ok())).toEqual({ allowed: true });
  });

  it("allows part of it", () => {
    expect(decidePayLaterDeclaration(ok({ amountPaise: 200000 }))).toEqual({ allowed: true });
  });

  // A patient must not be able to hand over money the clinic would then have
  // to give back -- there is no refund path for a credit nobody asked for.
  it("refuses more than is owed", () => {
    expect(decidePayLaterDeclaration(ok({ amountPaise: 480001 }))).toEqual({
      allowed: false,
      reason: "too_much",
    });
  });

  it("allows exactly what is owed, to the paisa", () => {
    expect(decidePayLaterDeclaration(ok({ owedPaise: 1, amountPaise: 1 }))).toEqual({
      allowed: true,
    });
  });

  it("refuses when nothing is owed", () => {
    expect(decidePayLaterDeclaration(ok({ owedPaise: 0 }))).toEqual({
      allowed: false,
      reason: "nothing_owed",
    });
  });

  it("refuses an amount that is not a positive whole number of paise", () => {
    for (const amountPaise of [0, -100, 1.5, NaN]) {
      expect(decidePayLaterDeclaration(ok({ amountPaise }))).toEqual({
        allowed: false,
        reason: "bad_amount",
      });
    }
  });

  // A second waiting declaration is the same money counted twice by whoever
  // opens the queue.
  it("refuses a second declaration while one is waiting", () => {
    expect(decidePayLaterDeclaration(ok({ hasPending: true }))).toEqual({
      allowed: false,
      reason: "already_pending",
    });
  });

  it("names the switch before anything else", () => {
    const d = decidePayLaterDeclaration(ok({ featureEnabled: false, owedPaise: 0, hasPending: true }));
    expect(d).toEqual({ allowed: false, reason: "feature_off" });
  });

  // Stopping a patient's terms stops new bookings only. Refusing the payment
  // here would strand money owed to the clinic on a screen the patient can
  // see and cannot act on.
  it("says nothing about whether terms are still granted", () => {
    expect(decidePayLaterDeclaration(ok())).toEqual({ allowed: true });
  });
});

describe("declarationRefusalMessage", () => {
  it("gives every reason a sentence", () => {
    for (const reason of [
      "feature_off",
      "nothing_owed",
      "too_much",
      "bad_amount",
      "already_pending",
    ] as const) {
      expect(declarationRefusalMessage(reason).length).toBeGreaterThan(15);
    }
  });

  // The patient's own vocabulary. "balance" is already their word for
  // unspent session credits, and the other three read as a collections
  // notice to somebody the clinic trusts.
  it("never uses the words kept off a patient's screen", () => {
    for (const reason of [
      "feature_off",
      "nothing_owed",
      "too_much",
      "bad_amount",
      "already_pending",
    ] as const) {
      const text = declarationRefusalMessage(reason).toLowerCase();
      for (const word of ["debt", "outstanding", "invoice", "balance"]) {
        expect(text, `"${word}" in "${text}"`).not.toContain(word);
      }
    }
  });
});

describe("methods", () => {
  it("offers every method but online as a declaration", () => {
    // Online is not a declaration: the gateway confirms it, so there is
    // nothing for anybody to check.
    expect(DECLARABLE_METHODS).not.toContain("online");
    expect(DECLARABLE_METHODS.length).toBe(SETTLEMENT_METHODS.length - 1);
  });

  it("labels every method in a patient's words", () => {
    for (const method of SETTLEMENT_METHODS) {
      expect(SETTLEMENT_METHOD_LABELS[method]).toBeTruthy();
      expect(SETTLEMENT_METHOD_LABELS[method]).not.toMatch(/_/);
    }
  });

  it("recognises only the methods it knows", () => {
    expect(isSettlementMethod("upi")).toBe(true);
    expect(isSettlementMethod("cheque")).toBe(false);
    expect(isSettlementMethod(null)).toBe(false);
  });
});

describe("how long one has waited", () => {
  const now = Date.parse("2026-09-21T10:00:00.000Z");
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

  it("counts whole days", () => {
    expect(settlementWaitDays(daysAgo(0), now)).toBe(0);
    expect(settlementWaitDays(daysAgo(6), now)).toBe(6);
  });

  it("reads an absent or unreadable date as no answer, never as zero", () => {
    expect(settlementWaitDays(null, now)).toBeNull();
    expect(settlementWaitDays("not a date", now)).toBeNull();
    expect(isStaleSettlement(null, now)).toBe(false);
  });

  // Exactly at the threshold counts, the same boundary isAgedBalance uses.
  it("is stale at the threshold and not one day under", () => {
    expect(isStaleSettlement(daysAgo(3), now)).toBe(true);
    expect(isStaleSettlement(daysAgo(2), now)).toBe(false);
  });
});

describe("pendingSettlements", () => {
  const row = (over: Partial<SettlementRow>): SettlementRow => ({
    id: "a",
    patient_id: "p",
    amount_paise: 1000,
    method: "upi",
    status: "pending",
    declared_at: "2026-09-01T00:00:00.000Z",
    ...over,
  });

  it("keeps only what is waiting", () => {
    const rows = [
      row({ id: "1" }),
      row({ id: "2", status: "confirmed" }),
      row({ id: "3", status: "rejected" }),
    ];
    expect(pendingSettlements(rows).map((r) => r.id)).toEqual(["1"]);
  });

  // Work with a person waiting behind it, so the one who has waited longest
  // is at the top -- the same rule the recommendation queue follows.
  it("puts the oldest first", () => {
    const rows = [
      row({ id: "new", declared_at: "2026-09-10T00:00:00.000Z" }),
      row({ id: "old", declared_at: "2026-09-01T00:00:00.000Z" }),
    ];
    expect(pendingSettlements(rows).map((r) => r.id)).toEqual(["old", "new"]);
  });
});

describe("reconcileSettlements", () => {
  // The one invariant the pool design stands on.
  it("agrees when every rupee is either on a session or still in the pool", () => {
    expect(reconcileSettlements({ confirmedPaise: 480000, settledPaise: 360000, unallocatedPaise: 120000 }))
      .toEqual({ agrees: true, differencePaise: 0 });
  });

  it("reports a session closed by money that never arrived", () => {
    const r = reconcileSettlements({ confirmedPaise: 120000, settledPaise: 240000, unallocatedPaise: 0 });
    expect(r.agrees).toBe(false);
    expect(r.differencePaise).toBe(-120000);
  });

  it("reports money that arrived and closed nothing", () => {
    const r = reconcileSettlements({ confirmedPaise: 240000, settledPaise: 120000, unallocatedPaise: 0 });
    expect(r.agrees).toBe(false);
    expect(r.differencePaise).toBe(120000);
  });

  it("agrees on a clinic with no settlements at all", () => {
    expect(reconcileSettlements({ confirmedPaise: 0, settledPaise: 0, unallocatedPaise: 0 }).agrees).toBe(true);
  });
});
