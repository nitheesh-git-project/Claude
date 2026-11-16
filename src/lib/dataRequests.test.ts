import { describe, expect, it } from "vitest";
import {
  allowedDataRequestMoves,
  allowedGrievanceMoves,
  deletionDue,
  grievanceDue,
  isDataRequestRole,
  makeReference,
  needsNote,
  validateDeletionReason,
  validateGrievance,
} from "./dataRequests";

const H = 60 * 60 * 1000;
const D = 24 * H;
const start = "2026-11-01T00:00:00Z";
const at = (ms: number) => new Date(Date.parse(start) + ms);

describe("makeReference", () => {
  it("is a prefix and six readable characters", () => {
    expect(makeReference("GRV")).toMatch(/^GRV-[A-HJ-NP-Z2-9]{6}$/);
    expect(makeReference("DEL", () => 0)).toBe("DEL-AAAAAA");
    expect(makeReference("EXP", () => 0.9999)).toBe("EXP-999999");
  });
});

describe("deletionDue", () => {
  it("counts 30 days and says when it is overdue", () => {
    expect(deletionDue({ created_at: start, status: "open" }, at(D))?.label).toBe("Due in 29 days");
    expect(deletionDue({ created_at: start, status: "in_progress" }, at(29 * D + 20 * H))?.label).toBe("Due in 4 hours");
    const late = deletionDue({ created_at: start, status: "open" }, at(33 * D));
    expect(late?.overdue).toBe(true);
    expect(late?.label).toBe("3 days overdue");
  });
  it("has no deadline once closed", () => {
    for (const status of ["completed", "rejected", "withdrawn"] as const) {
      expect(deletionDue({ created_at: start, status }, at(D))).toBeNull();
    }
  });
});

describe("grievanceDue", () => {
  it("asks for acknowledgement within 48 hours, then resolution within 30 days", () => {
    const fresh = grievanceDue({ created_at: start, status: "new" }, at(2 * H));
    expect(fresh?.step).toBe("acknowledge");
    expect(fresh?.label).toBe("Due in 2 days");
    expect(grievanceDue({ created_at: start, status: "new" }, at(49 * H))?.overdue).toBe(true);
    const acked = grievanceDue({ created_at: start, status: "acknowledged" }, at(3 * D));
    expect(acked?.step).toBe("resolve");
    expect(acked?.label).toBe("Due in 27 days");
    expect(grievanceDue({ created_at: start, status: "resolved" }, at(D))).toBeNull();
  });
});

describe("moves", () => {
  it("only moves forward, and closed cases stay closed", () => {
    expect(allowedDataRequestMoves("open")).toEqual(["in_progress", "completed", "rejected"]);
    expect(allowedDataRequestMoves("completed")).toEqual([]);
    expect(allowedDataRequestMoves("withdrawn")).toEqual([]);
    expect(allowedGrievanceMoves("new")).toEqual(["acknowledged", "resolved"]);
    expect(allowedGrievanceMoves("resolved")).toEqual([]);
  });
  it("needs a note to decline or resolve", () => {
    expect(needsNote("rejected")).toBe(true);
    expect(needsNote("resolved")).toBe(true);
    expect(needsNote("completed")).toBe(false);
  });
});

describe("validateGrievance", () => {
  const ok = { name: "  Asha  Rao ", email: "Asha@Example.com", category: "payment", message: "I was charged twice for one session." };
  it("accepts a complete complaint and tidies it", () => {
    const r = validateGrievance(ok);
    expect(r.ok && r.value).toMatchObject({ name: "Asha Rao", email: "asha@example.com", phone: null, bookingReference: null, spam: false });
  });
  it("refuses each missing or bad field in words", () => {
    const err = (patch: Record<string, unknown>) => {
      const r = validateGrievance({ ...ok, ...patch });
      return r.ok ? null : r.error;
    };
    expect(err({ name: "" })).toMatch(/name/);
    expect(err({ email: "nope" })).toMatch(/email/);
    expect(err({ category: "x" })).toMatch(/about/);
    expect(err({ message: "short" })).toMatch(/more/);
    expect(err({ phone: "abc" })).toMatch(/phone/);
    expect(validateGrievance(null).ok).toBe(false);
  });
  it("flags a filled honeypot", () => {
    const r = validateGrievance({ ...ok, website: "http://spam" });
    expect(r.ok && r.value.spam).toBe(true);
  });
});

describe("validateDeletionReason / isDataRequestRole", () => {
  it("is optional and capped", () => {
    expect(validateDeletionReason(undefined)).toEqual({ ok: true, value: null });
    expect(validateDeletionReason("  ")).toEqual({ ok: true, value: null });
    expect(validateDeletionReason("x".repeat(1001)).ok).toBe(false);
    expect(validateDeletionReason(5).ok).toBe(false);
  });
  it("covers patients, therapists and hospitals, never admins", () => {
    expect(isDataRequestRole("hospital")).toBe(true);
    expect(isDataRequestRole("admin")).toBe(false);
  });
});
