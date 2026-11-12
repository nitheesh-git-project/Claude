import { describe, expect, it } from "vitest";
import {
  EMPTY_IMPERSONATION_FILTERS,
  buildImpersonationLog,
  clinicDayKey,
  describeImpersonatedAction,
  filterImpersonationLog,
  impersonationStatus,
  type ImpersonationSessionRow,
} from "./impersonationLog";

const NOW = Date.parse("2026-11-11T10:00:00Z");
function session(over: Partial<ImpersonationSessionRow> = {}): ImpersonationSessionRow {
  return {
    id: "s1",
    admin_id: "a1",
    target_id: "p1",
    target_role: "patient",
    reason: "Patient says the Book button does nothing",
    started_at: "2026-11-11T09:00:00Z",
    expires_at: "2026-11-11T09:30:00Z",
    ended_at: "2026-11-11T09:12:00Z",
    ended_reason: "admin_exited",
    ...over,
  };
}
const names = new Map([
  ["a1", "Asha (admin)"],
  ["a2", "Ravi (admin)"],
  ["p1", "Meera Patel"],
  ["t1", "Dr Kumar"],
]);

describe("impersonation log", () => {
  it("says whether a window is open, ended or ran out", () => {
    expect(impersonationStatus(session(), NOW)).toBe("ended");
    expect(impersonationStatus(session({ ended_at: null, ended_reason: null }), NOW)).toBe("expired");
    expect(impersonationStatus(session({ ended_at: null, ended_reason: null, expires_at: "2026-11-11T10:20:00Z" }), NOW)).toBe("open");
    expect(impersonationStatus(session({ ended_reason: "expired" }), NOW)).toBe("expired");
  });

  it("joins each window to the changes made inside it, newest window first", () => {
    const log = buildImpersonationLog(
      [session(), session({ id: "s2", started_at: "2026-11-11T09:40:00Z", ended_at: null, ended_reason: null, expires_at: "2026-11-11T10:10:00Z" })],
      [
        { created_at: "2026-11-11T09:05:00Z", details: { sessionId: "s1", method: "POST", path: "/api/patient/addresses" } },
        { created_at: "2026-11-11T09:01:00Z", details: { sessionId: "s1", method: "DELETE", path: "/api/patient/addresses" } },
        { created_at: "2026-11-11T09:02:00Z", details: { sessionId: "other" } },
        { created_at: "2026-11-11T09:02:00Z", details: null },
      ],
      names,
      NOW
    );
    expect(log.map((e) => e.id)).toEqual(["s2", "s1"]);
    expect(log[0]).toMatchObject({ status: "open", minutes: null, endedAt: null, actions: [] });
    expect(log[1]).toMatchObject({ adminName: "Asha (admin)", targetName: "Meera Patel", minutes: 12 });
    expect(log[1].actions.map((a) => a.method)).toEqual(["DELETE", "POST"]);
  });

  it("ends an expired window at its expiry, and names a deleted account", () => {
    const [e] = buildImpersonationLog([session({ ended_at: null, ended_reason: null, target_id: null })], [], names, NOW);
    expect(e.endedAt).toBe("2026-11-11T09:30:00Z");
    expect(e.minutes).toBe(30);
    expect(e.targetName).toBe("A deleted account");
  });

  it("filters by admin, role, words, clinic day and changes made", () => {
    const log = buildImpersonationLog(
      [
        session(),
        session({ id: "s2", admin_id: "a2", target_id: "t1", target_role: "therapist", reason: "Checking the payout screen", started_at: "2026-11-09T20:00:00Z" }),
      ],
      [{ created_at: "2026-11-11T09:05:00Z", details: { sessionId: "s1", method: "POST", path: "/api/x" } }],
      names,
      NOW
    );
    const f = EMPTY_IMPERSONATION_FILTERS;
    expect(filterImpersonationLog(log, f)).toHaveLength(2);
    expect(filterImpersonationLog(log, { ...f, adminId: "a2" }).map((e) => e.id)).toEqual(["s2"]);
    expect(filterImpersonationLog(log, { ...f, role: "patient" }).map((e) => e.id)).toEqual(["s1"]);
    expect(filterImpersonationLog(log, { ...f, query: "payout" }).map((e) => e.id)).toEqual(["s2"]);
    expect(filterImpersonationLog(log, { ...f, query: "meera" }).map((e) => e.id)).toEqual(["s1"]);
    expect(filterImpersonationLog(log, { ...f, onlyWithChanges: true }).map((e) => e.id)).toEqual(["s1"]);
    // 20:00 UTC on the 9th is 01:30 on the 10th in the clinic.
    expect(clinicDayKey("2026-11-09T20:00:00Z")).toBe("2026-11-10");
    expect(filterImpersonationLog(log, { ...f, from: "2026-11-10", to: "2026-11-10" }).map((e) => e.id)).toEqual(["s2"]);
  });

  it("describes a change in words", () => {
    expect(describeImpersonatedAction("/api/patient/addresses/9b1c2d3e-aaaa-bbbb-cccc-1234567890ab", "DELETE")).toBe(
      "Deleted: patient addresses"
    );
    expect(describeImpersonatedAction("/api/razorpay/create-order", "POST")).toBe("Sent: razorpay create order");
  });
});
