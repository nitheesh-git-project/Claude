import { describe, expect, it } from "vitest";
import { buildRecommendationPulse, type RecommendationPulseRow } from "./recommendationPulse";

const NOW = Date.parse("2026-10-12T10:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const ahead = (d: number) => new Date(NOW + d * DAY).toISOString();

const base: RecommendationPulseRow = {
  id: "p1",
  status: "active",
  patientName: "Priya",
  therapistName: "Dr Ananya",
  conditionTitle: "Spine Conditions",
  sessionCount: 6,
  pricePaise: 299400,
  isHomeVisit: false,
  createdAt: ago(1),
  submittedAt: ago(1),
  acceptedAt: null,
  declinedAt: null,
  declineReason: null,
  expiresAt: ahead(20),
  purchase: null,
};
const opts = { href: "/admin/dashboard?tab=x", showMoney: true };
const one = (r: Partial<RecommendationPulseRow>, o = opts) =>
  buildRecommendationPulse([{ ...base, ...r }], NOW, o);

describe("buildRecommendationPulse", () => {
  it("pins a recommendation waiting for approval, dated from its submission", () => {
    const { counts, events } = one({ status: "pending_review", submittedAt: ago(3) });
    expect(counts.waitingApproval).toBe(1);
    expect(events[0]).toMatchObject({ needsYou: true, tone: "warn", at: ago(3) });
    expect(events[0].title).toContain("waiting for your approval");
    expect(events[0].detail).toContain("6 sessions of Spine Conditions");
    expect(events[0].detail).toContain("₹2,994");
  });

  it("shows one with the patient, and flags it when it lapses soon", () => {
    expect(one({}).events[0]).toMatchObject({ tone: "info", needsYou: false });
    const lapsing = one({ expiresAt: ahead(2) });
    expect(lapsing.counts.lapsingSoon).toBe(1);
    expect(lapsing.events[0].title).toContain("lapses in 2 days");
    expect(lapsing.events[0].needsYou).toBe(false);
  });

  it("counts a paid recommendation as a win with its amount", () => {
    const { counts, events } = one({
      status: "accepted",
      acceptedAt: ago(1),
      purchase: { amountPaise: 299400, paidAt: ago(1), booked: 0 },
    });
    expect(counts).toMatchObject({ paidInWindow: 1, paidInWindowPaise: 299400, paidUnbooked: 0 });
    expect(events[0]).toMatchObject({ tone: "good", title: "Priya accepted and paid ₹2,994" });
  });

  it("pins paid-but-nothing-booked once two days have passed", () => {
    const { counts, events } = one({
      status: "accepted",
      acceptedAt: ago(4),
      purchase: { amountPaise: 299400, paidAt: ago(4), booked: 0 },
    });
    expect(counts.paidUnbooked).toBe(1);
    expect(events[0]).toMatchObject({ needsYou: true, title: "Paid but nothing booked - Priya" });
    const booked = one({
      status: "accepted",
      acceptedAt: ago(4),
      purchase: { amountPaise: 299400, paidAt: ago(4), booked: 2 },
    });
    expect(booked.counts.paidUnbooked).toBe(0);
    expect(booked.events[0].needsYou).toBe(false);
  });

  it("says why a patient declined, and drops settled events after the window", () => {
    const d = one({ status: "declined", declinedAt: ago(2), declineReason: "Too expensive" });
    expect(d.events[0]).toMatchObject({ tone: "bad" });
    expect(d.events[0].detail).toContain('"Too expensive"');
    expect(one({ status: "declined", declinedAt: ago(30) }).events).toHaveLength(0);
  });

  it("reports a lapse, and leaves the clinic's own decisions to the audit log", () => {
    expect(one({ expiresAt: ago(1) }).events[0].title).toContain("lapsed");
    expect(one({ status: "withdrawn" }).events).toHaveLength(0);
    expect(one({ status: "rejected" }).events).toHaveLength(0);
  });

  it("leaves amounts out for a scope that cannot open Money", () => {
    const { events, counts } = one(
      { status: "accepted", acceptedAt: ago(1), purchase: { amountPaise: 299400, paidAt: ago(1), booked: 1 } },
      { ...opts, showMoney: false }
    );
    expect(events[0].title).toBe("Priya accepted and paid");
    expect(counts.paidInWindow).toBe(1);
    expect(one({ status: "pending_review" }, { ...opts, showMoney: false }).events[0].detail).not.toContain("₹");
  });

  it("puts urgent items first, then newest first", () => {
    const { events } = buildRecommendationPulse(
      [
        { ...base, id: "a", submittedAt: ago(0.1) },
        { ...base, id: "b", status: "pending_review", submittedAt: ago(5) },
      ],
      NOW,
      opts
    );
    expect(events.map((e) => e.id)).toEqual(["rec-review-b", "rec-sent-a"]);
  });
});
