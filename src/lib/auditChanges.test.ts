import { describe, it, expect } from "vitest";
import { auditChanges } from "./auditChanges";
import { readableDetails } from "./activityDetails";

describe("auditChanges", () => {
  it("keeps only what changed, as previousX beside x", () => {
    const out = auditChanges(
      { title: "Knee pain", price_paise: 49_900, duration_minutes: 45 },
      { title: "Knee pain", price_paise: 59_900, duration_minutes: 45 }
    );
    expect(out).toEqual({ previousPricePaise: 49_900, pricePaise: 59_900 });
  });

  it("reads as a rupee change in the log's detail dialog", () => {
    const { changes } = readableDetails(auditChanges({ price_paise: 49_900 }, { price_paise: 59_900 }));
    expect(changes).toEqual([{ label: "Price", from: "₹499", to: "₹599" }]);
  });

  it("treats a numeric column read back as a string as the same value", () => {
    expect(auditChanges({ travel_fee_paise: "15000" }, { travel_fee_paise: 15_000 })).toEqual({});
  });

  it("logs every value as new when the row could not be read", () => {
    expect(auditChanges(null, { active: true })).toEqual({ previousActive: null, active: true });
  });

  it("limits itself to the fields asked for", () => {
    expect(auditChanges({ a: 1, b: 1 }, { a: 2, b: 2 }, ["a"])).toEqual({ previousA: 1, a: 2 });
  });
});
