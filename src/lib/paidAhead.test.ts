import { describe, expect, it } from "vitest";
import { paidAheadOf, type PaidAheadAppointment } from "./paidAhead";

const END = new Date("2026-11-12T00:00:00+05:30").getTime();

function session(over: Partial<PaidAheadAppointment> = {}): PaidAheadAppointment {
  return {
    slot_time: "2026-11-12T05:30:00Z",
    paid_at: "2026-11-11T16:47:39Z",
    status: "requested",
    payment_status: "paid",
    amount_paid_paise: 49900,
    package_purchase_id: null,
    refund_status: null,
    refund_amount_paise: null,
    ...over,
  };
}

describe("paidAheadOf", () => {
  it("counts a session paid before the range ends for a date after it", () => {
    expect(paidAheadOf([session()], END)).toEqual({
      count: 1,
      paidPaise: 49900,
      refundedPaise: 0,
      netPaise: 49900,
      latestSlotTime: "2026-11-12T05:30:00Z",
    });
  });

  it("nets a processed partial refund off it", () => {
    const r = paidAheadOf([session({ refund_status: "processed", refund_amount_paise: 10000 })], END);
    expect(r).toMatchObject({ count: 1, paidPaise: 49900, refundedPaise: 10000, netPaise: 39900 });
  });

  it("leaves out sessions inside the range, paid after it, cancelled, unpaid or on a programme", () => {
    const r = paidAheadOf(
      [
        session({ slot_time: "2026-11-11T10:00:00Z" }),
        session({ paid_at: "2026-11-12T01:00:00Z" }),
        session({ status: "cancelled" }),
        session({ payment_status: "pending" }),
        session({ package_purchase_id: "pkg" }),
        session({ amount_paid_paise: 0 }),
      ],
      END
    );
    expect(r.count).toBe(0);
    expect(r.paidPaise).toBe(0);
    expect(r.latestSlotTime).toBeNull();
  });

  it("never nets more than was paid", () => {
    const r = paidAheadOf(
      [session({ amount_paid_paise: 5000, refund_status: "processed", refund_amount_paise: 9000 })],
      END
    );
    expect(r.refundedPaise).toBe(5000);
    expect(r.netPaise).toBe(0);
  });
});
