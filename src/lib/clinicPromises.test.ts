import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPROVAL_WAIT_WORKING_DAYS,
  DEFAULT_BOOKING_CONFIRMATION_HOURS,
  approvalWaitPhrase,
  approvalWaitWorkingDays,
  bookingConfirmationHours,
  hoursPhrase,
  requestedTimeNotice,
} from "./clinicPromises";

describe("clinic promises", () => {
  it("fall back to the default for anything unusable", () => {
    for (const bad of [undefined, null, "4", 0, -1, 2.5, 500, Number.NaN]) {
      expect(bookingConfirmationHours(bad)).toBe(DEFAULT_BOOKING_CONFIRMATION_HOURS);
      expect(approvalWaitWorkingDays(bad)).toBe(DEFAULT_APPROVAL_WAIT_WORKING_DAYS);
    }
  });

  it("take a usable setting over the default", () => {
    expect(bookingConfirmationHours(2)).toBe(2);
    expect(approvalWaitWorkingDays(3)).toBe(3);
  });

  it("say the request plainly, with both ways it can end", () => {
    const text = requestedTimeNotice(4);
    expect(text).toMatch(/is a request/);
    expect(text).toMatch(/confirm within 4 hours/);
    expect(text).toMatch(/another time/);
    expect(text).toMatch(/refund you in full/);
  });

  it("pluralise", () => {
    expect(hoursPhrase(1)).toBe("1 hour");
    expect(hoursPhrase(6)).toBe("6 hours");
    expect(approvalWaitPhrase(1)).toBe("usually within 1 working day");
    expect(approvalWaitPhrase(2)).toBe("usually within 2 working days");
  });
});
