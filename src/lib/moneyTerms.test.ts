import { describe, it, expect } from "vitest";
import {
  GLOSSARY_ORDER,
  MONEY_TERMS,
  SCOPE_LABEL,
  moneyTerm,
  type MoneyTermKey,
} from "@/lib/moneyTerms";

const KEYS = Object.keys(MONEY_TERMS) as MoneyTermKey[];

describe("money vocabulary", () => {
  // The rule the glossary was written to enforce, now checkable: two figures
  // sharing a name is how "clinic share" and "profit" became the same word
  // on two screens.
  it("gives each figure exactly one name", () => {
    const names = KEYS.map((k) => MONEY_TERMS[k].term.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("says what every figure means and when it is measured", () => {
    for (const key of KEYS) {
      const entry = moneyTerm(key);
      expect(entry.term.length).toBeGreaterThan(0);
      // Long enough to be a sentence: a two-word gloss is the label again.
      expect(entry.meaning.length).toBeGreaterThan(30);
      expect(SCOPE_LABEL[entry.scope]).toBeTruthy();
    }
  });

  // A balance scoped to a date range would let an admin read "nothing owed"
  // off a quiet week while a real debt sat outside the window.
  it("keeps the balances out of the date range", () => {
    expect(moneyTerm("owed_to_therapists").scope).toBe("now");
    expect(moneyTerm("cash_collected").scope).toBe("now");
    expect(moneyTerm("manual_refund_pending").scope).toBe("now");
    expect(moneyTerm("net_revenue").scope).toBe("range");
    expect(moneyTerm("operating_profit").scope).toBe("range");
    expect(moneyTerm("gateway_fee_percent").scope).toBe("setting");
  });

  // The glossary is generated from this list, so a term missing from it is a
  // term with no definition anywhere -- the state this module replaced.
  it("lists every term in the glossary exactly once", () => {
    expect([...GLOSSARY_ORDER].sort()).toEqual([...KEYS].sort());
    expect(new Set(GLOSSARY_ORDER).size).toBe(GLOSSARY_ORDER.length);
  });

  it("opens the glossary on the subtraction chain, in the order it happens", () => {
    expect(GLOSSARY_ORDER.slice(0, 6)).toEqual([
      "gross_revenue",
      "refunded",
      "net_revenue",
      "therapist_share",
      "partner_share",
      "clinic_share",
    ]);
  });
});
