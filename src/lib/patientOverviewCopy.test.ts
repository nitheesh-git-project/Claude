import { describe, expect, it } from "vitest";
import { hasBookingHistory, noNextSessionHeadline, noNextSessionNote } from "./patientOverviewCopy";

describe("patient Overview with no next session", () => {
  it("tells a returning patient nothing is coming up, not that nothing was booked (F-03)", () => {
    const history = hasBookingHistory([
      { status: "confirmed", payment_status: "paid", paid_at: "2026-10-01T10:00:00Z" },
    ]);
    expect(history).toBe(true);
    expect(noNextSessionNote(history)).toBe("No upcoming sessions");
    expect(noNextSessionHeadline(history)).toMatch(/^No upcoming sessions/);
  });

  it("keeps 'Nothing booked yet' for a patient with no bookings", () => {
    expect(hasBookingHistory([])).toBe(false);
    expect(noNextSessionNote(false)).toBe("Nothing booked yet");
    expect(noNextSessionHeadline(false)).toMatch(/^Nothing booked yet/);
  });

  it("counts a completed or a refunded session as history, not an abandoned checkout", () => {
    expect(hasBookingHistory([{ status: "completed", payment_status: "unpaid" }])).toBe(true);
    expect(hasBookingHistory([{ status: "cancelled", payment_status: "paid" }])).toBe(true);
    expect(hasBookingHistory([{ status: "requested", payment_status: "unpaid", paid_at: null }])).toBe(false);
    expect(hasBookingHistory([{ status: "requested", payment_status: "failed" }])).toBe(false);
  });
});
