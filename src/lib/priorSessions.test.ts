import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isFirstSessionEligible } from "@/lib/discounts";

// "Is this patient new?" is asked in three places and answered by one query.
//
// It was answered by three, and they had quietly stopped agreeing: all three
// asked `payment_status = 'paid'`, and a session booked on pay-later terms
// is never paid. So a trusted patient read as brand new on every booking
// they ever made, and collected the standing first-session offer, a
// first-session-only promo code and an invite welcome again each time.
//
// The failure produced no error and no wrong-looking screen, which is the
// same reason `formatDateTime.test.ts` walks the source for a timezone-less
// date rather than trusting a reviewer to spot one. These assertions are
// narrow on purpose: they are not a ban on `payment_status = 'paid'`, which
// is the correct question in dozens of places. They say only that the two
// readers of *this* question ask it through the shared module.

const CHECKOUT = "src/lib/checkoutQuote.ts";
const PROMO = "src/lib/promoCodesServer.ts";
const SHARED = "countPriorCommittedSessions";

describe("one answer to 'is this patient new'", () => {
  it("has both readers going through the shared query", () => {
    for (const file of [CHECKOUT, PROMO]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} should read ${SHARED}`).toContain(SHARED);
    }
  });

  it("leaves neither reader with a paid-count of its own", () => {
    for (const file of [CHECKOUT, PROMO]) {
      const source = readFileSync(file, "utf8");
      // The exact shape of the query that drifted. A reader that grows its
      // own copy back is the regression this guards, and it would otherwise
      // be invisible until a patient on terms was given a third discount.
      expect(
        source,
        `${file} counts prior paid sessions itself instead of using ${SHARED}`
      ).not.toContain('.eq("payment_status", "paid")');
    }
  });

  it("keeps the database's own copy of the predicate in step", () => {
    // claim_invite's original definition carried the comment "the same test
    // the first-session offer uses" -- and then the offer's test moved and
    // it did not. The last definition in the file is the one that survives
    // being applied, so that is the one asserted.
    const schema = readFileSync("supabase/schema.sql", "utf8");
    const last = schema.lastIndexOf("create or replace function public.claim_invite(");
    expect(last).toBeGreaterThan(-1);
    const body = schema.slice(last, last + 4000);
    expect(body).toContain("payment_terms = 'pay_later'");
    // A cancelled booking on terms was never delivered and owes nothing, so
    // it must not spend a once-ever welcome.
    expect(body).toContain("status <> 'cancelled'");
  });
});

describe("isFirstSessionEligible", () => {
  // The judgement itself never changed -- only what was counted. These are
  // here so a future change to one cannot be mistaken for a change to both.
  it("is new only with nothing behind them", () => {
    expect(isFirstSessionEligible({ count: 0, failed: false })).toBe(true);
    expect(isFirstSessionEligible({ count: 1, failed: false })).toBe(false);
  });

  it("fails closed on an answer nobody could read", () => {
    expect(isFirstSessionEligible({ count: null, failed: true })).toBe(false);
  });
});
