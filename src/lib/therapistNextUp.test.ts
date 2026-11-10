import { describe, expect, it } from "vitest";
import { pickNextUp } from "@/lib/therapistNextUp";

const now = Date.parse("2026-10-27T12:30:00Z");
const at = (iso: string, over: Record<string, unknown> = {}) => ({ id: iso, status: "confirmed", slot_time: iso, duration_minutes: 45, no_show: false, ...over });

describe("Next up on the therapist Overview (B9)", () => {
  it("prefers the session in progress over the next one", () => {
    const r = pickNextUp([at("2026-10-27T14:00:00Z"), at("2026-10-27T12:00:00Z")], now);
    expect(r).toMatchObject({ phase: "now", appointment: { id: "2026-10-27T12:00:00Z" } });
  });
  it("keeps a just-ended session for the note, then moves on", () => {
    expect(pickNextUp([at("2026-10-27T11:30:00Z")], now)?.phase).toBe("now");
    expect(pickNextUp([at("2026-10-27T10:00:00Z"), at("2026-10-27T15:00:00Z")], now)).toMatchObject({ phase: "later", appointment: { id: "2026-10-27T15:00:00Z" } });
  });
  it("skips a no-show, a completed or cancelled session, and says nothing with nothing booked", () => {
    expect(pickNextUp([at("2026-10-27T12:00:00Z", { no_show: true })], now)).toBeNull();
    expect(pickNextUp([at("2026-10-27T12:00:00Z", { status: "completed" })], now)).toBeNull();
    expect(pickNextUp([at("2026-10-27T15:00:00Z", { status: "cancelled" })], now)).toBeNull();
    expect(pickNextUp([at("2026-10-27T15:00:00Z", { status: "requested" })], now)?.phase).toBe("later");
  });
});
