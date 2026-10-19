import { describe, expect, it } from "vitest";
import { sessionListPricePaise } from "./sessionListPrice";
import { SESSION_FEE_PAISE } from "./pricing";

describe("sessionListPricePaise", () => {
  // F-10: an admin booking for a ₹499 service, not yet paid. The list and the
  // patient's history read ₹499; the drawer read the global ₹1,999 fee.
  it("prices an unpaid session at its own service's price, never the global fee", () => {
    expect(sessionListPricePaise({ amount_paid_paise: null }, 49900)).toBe(49900);
    expect(sessionListPricePaise({ amount_paid_paise: null }, 49900)).not.toBe(SESSION_FEE_PAISE);
  });

  it("reads what was charged before the service's price", () => {
    expect(sessionListPricePaise({ amount_paid_paise: 39900 }, 49900)).toBe(39900);
    // A free booking is a real figure, not a missing one.
    expect(sessionListPricePaise({ amount_paid_paise: 0 }, 49900)).toBe(0);
  });

  it("reads a pay-later session's frozen price before the live catalogue", () => {
    expect(sessionListPricePaise({ amount_paid_paise: null, amount_due_paise: 45000 }, 49900)).toBe(
      45000
    );
  });

  it("falls back to the standard fee only for a session with no service", () => {
    expect(sessionListPricePaise({ amount_paid_paise: null }, undefined)).toBe(SESSION_FEE_PAISE);
    expect(sessionListPricePaise({ amount_paid_paise: null }, null)).toBe(SESSION_FEE_PAISE);
  });
});
