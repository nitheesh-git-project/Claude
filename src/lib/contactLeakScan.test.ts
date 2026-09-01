import { describe, it, expect } from "vitest";
import {
  scanForContactLeaks,
  hasBlockingLeak,
  blockingLeakMessage,
  summariseFindings,
} from "@/lib/contactLeakScan";

const tier = (text: string) => {
  const f = scanForContactLeaks(text);
  return hasBlockingLeak(f) ? "block" : f.length > 0 ? "flag" : "clean";
};

describe("contactLeakScan", () => {
  // The whole reason this has two tiers: a physiotherapist's notes are full
  // of numbers, and a scanner that fires on them is one an admin stops
  // reading. Every string here must come back clean.
  it.each([
    "3 sets of 12 reps, twice daily",
    "grade III mobilisation x3, hold 30 seconds",
    "Reduce load for 2 weeks, review on 12/03/2026",
    "Patient reports 6/10 pain at end range",
    "Take 500 mg paracetamol, max 4 doses in 24 hours",
    "Ice 15 minutes every 2 hours for the first 48 hours",
    "Straight leg raise to 45 degrees, 10 holds of 5 seconds",
    "Call 108 immediately if the numbness spreads",
    "Range improved from 90 to 120 degrees since 2024",
    "Follow up at week two, then review",
    "Pain at rest is now minimal",
    "Blood pressure 120/80, pulse 72",
    "Session on 2026-03-12 at 10:30",
    "Ref: order 2024-00123456 dispatched",
    "Do 20 repetitions, 3 times a day, for 6 weeks",
  ])("leaves clinical text alone: %s", (text) => {
    expect(tier(text)).toBe("clean");
  });

  it.each([
    "pay me at pooja@okhdfcbank instead",
    "send it to 9876543210@ybl",
    "here is my link razorpay.me/@poojaphysio",
    "just do a gpay next time",
    "NEFT to my account number 123456789012, IFSC HDFC0001234",
    "phonepe is easier for me",
    "my upi id is pooja@paytm",
  ])("refuses payment details: %s", (text) => {
    expect(tier(text)).toBe("block");
  });

  it.each([
    "call me on 98765 43210 if it worsens",
    "reach me at pooja dot sharma at gmail dot com",
    "message me on wa.me/919876543210",
    "my instagram.com/poojaphysio has the videos",
    "+91 98765-43210",
    "see https://example.com/exercises",
  ])("records but delivers: %s", (text) => {
    expect(tier(text)).toBe("flag");
  });

  it("undoes spelled-out digits", () => {
    expect(tier("nine eight seven six five four three two one zero")).toBe("flag");
  });

  it("returns nothing for empty input", () => {
    expect(scanForContactLeaks("")).toEqual([]);
    expect(scanForContactLeaks(null)).toEqual([]);
    expect(scanForContactLeaks(undefined)).toEqual([]);
    expect(scanForContactLeaks("   ")).toEqual([]);
  });

  it("reports one finding per real thing, not one per pattern", () => {
    // A UPI handle is also email-shaped and a payment link is also a URL.
    // Counting both would double every row in the admin's queue.
    const upi = scanForContactLeaks("pay pooja@okhdfcbank");
    expect(upi).toHaveLength(1);
    expect(upi[0].kind).toBe("upi_handle");

    const link = scanForContactLeaks("https://razorpay.me/@pooja");
    expect(link.filter((f) => f.kind === "payment_link")).toHaveLength(1);
    expect(link.filter((f) => f.kind === "url")).toHaveLength(0);
  });

  it("names what it refused, so the writer can act on it", () => {
    const msg = blockingLeakMessage(scanForContactLeaks("pooja@okhdfcbank"));
    expect(msg).toContain("upi handle");
    expect(msg).toContain("through the platform");
  });

  it("summarises repeats with a count", () => {
    const s = summariseFindings(scanForContactLeaks("call 9876543210 or 9812345678"));
    expect(s).toBe("Phone number ×2");
    expect(summariseFindings([])).toBe("");
  });
});
