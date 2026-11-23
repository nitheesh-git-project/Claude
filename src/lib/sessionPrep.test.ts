import { describe, expect, it } from "vitest";
import { PREP_LEAD_MS, PREP_PROTOCOL_KEYS, prepListFor, prepListForProtocol, prepListProblems, prepWindowOpen, readinessLine } from "@/lib/sessionPrep";
import { SESSION_PROTOCOLS, CLINICAL_REVIEW_MARK } from "@/lib/sessionProtocols";

describe("the get-ready lists (P1)", () => {
  it("has one list for every guided-check protocol, each passing its own checks", () => {
    expect([...PREP_PROTOCOL_KEYS].sort()).toEqual(SESSION_PROTOCOLS.map((p) => p.key).sort());
    expect(prepListProblems()).toEqual([]);
  });
  it("is marked for review by a senior physiotherapist", () => {
    for (const key of PREP_PROTOCOL_KEYS) expect(prepListForProtocol(key)?.review).toBe(CLINICAL_REVIEW_MARK);
  });
  it("gives the knee list the chair, the towel and the path its tests need", () => {
    const knee = prepListForProtocol("ortho_knee")!;
    expect(knee.items.map((i) => i.id)).toEqual(expect.arrayContaining(["chair", "towel", "path"]));
  });
  it("picks the condition type's default check", () => {
    expect(prepListFor("pediatrics")?.protocolKey).toBe("pediatrics");
    expect(prepListForProtocol("nope")).toBeNull();
  });
});

describe("when the list shows", () => {
  const start = Date.parse("2026-11-24T12:30:00Z");
  it("opens two days before and closes at the end of the session", () => {
    expect(prepWindowOpen("2026-11-24T12:30:00Z", 60, start - PREP_LEAD_MS - 1)).toBe(false);
    expect(prepWindowOpen("2026-11-24T12:30:00Z", 60, start - PREP_LEAD_MS)).toBe(true);
    expect(prepWindowOpen("2026-11-24T12:30:00Z", 60, start + 59 * 60_000)).toBe(true);
    expect(prepWindowOpen("2026-11-24T12:30:00Z", 60, start + 60 * 60_000)).toBe(false);
    expect(prepWindowOpen("not a date", 60, start)).toBe(false);
  });
});

describe("the therapist's line", () => {
  const t = () => "5:52 PM";
  it("says ready with the time, and never calls a failed read 'not ready'", () => {
    expect(readinessLine({ status: "ready", at: "x" }, "Priya", t)).toEqual({ tone: "ok", text: "Priya is ready · ticked the get-ready list at 5:52 PM" });
    expect(readinessLine({ status: "unknown" }, "Priya", t)?.text).toBe("Couldn't check whether Priya ticked the get-ready list.");
    expect(readinessLine({ status: "not_yet" }, "Priya", t)?.tone).toBe("info");
    expect(readinessLine({ status: "no_session" }, "Priya", t)).toBeNull();
  });
});
