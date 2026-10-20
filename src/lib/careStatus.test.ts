import { describe, expect, it } from "vitest";
import {
  changeIsNoOp,
  clearHasNothingToEnd,
  isOverrideStale,
  orderCareStatusEvents,
  parseCareStatusEventRow,
  shapeCareStatus,
  validateCareStatusChange,
  type CareStatusEvent,
} from "@/lib/careStatus";

let n = 0;
function ev(over: Partial<CareStatusEvent> & Pick<CareStatusEvent, "kind" | "createdAt">): CareStatusEvent {
  n += 1;
  return {
    id: `e${String(n).padStart(3, "0")}`,
    patientId: "p1",
    value: null,
    reason: null,
    profileKind: "ortho",
    setBy: "t1",
    setByRole: "therapist",
    ...over,
  };
}

describe("shapeCareStatus", () => {
  it("has no phase and no override before anything is set", () => {
    expect(shapeCareStatus([], { profileKind: "ortho" })).toEqual({ phase: null, override: null });
  });

  it("the latest phase wins, whatever order the rows came back in", () => {
    const a = ev({ kind: "phase", value: "Settle pain", createdAt: "2026-10-01T10:00:00Z" });
    const b = ev({ kind: "phase", value: "Strengthen", createdAt: "2026-10-10T10:00:00Z", reason: "Pain settled" });
    const state = shapeCareStatus([b, a], { profileKind: "ortho" });
    expect(state.phase).toMatchObject({ phase: "Strengthen", eventId: b.id, reason: "Pain settled" });
  });

  it("passes over a phase chosen under another profile kind, or not one of this kind's", () => {
    const neuro = ev({ kind: "phase", value: "Build movement", profileKind: "neuro", createdAt: "2026-10-01T10:00:00Z" });
    const pd = ev({ kind: "phase", value: "Assess", profileKind: "neuro_parkinsons", createdAt: "2026-10-02T10:00:00Z" });
    expect(shapeCareStatus([neuro, pd], { profileKind: "neuro_parkinsons" }).phase?.phase).toBe("Assess");
    expect(shapeCareStatus([neuro, pd], { profileKind: "neuro" }).phase?.phase).toBe("Build movement");
    const bogus = ev({ kind: "phase", value: "Not a phase", createdAt: "2026-10-03T10:00:00Z" });
    expect(shapeCareStatus([bogus], { profileKind: "ortho" }).phase).toBeNull();
  });

  it("the latest override wins, and a clear ends the override before it", () => {
    const first = ev({ kind: "status_override", value: "needs_attention", reason: "New knee swelling today", createdAt: "2026-10-01T10:00:00Z" });
    const second = ev({ kind: "status_override", value: "steady", reason: "Swelling has settled again", createdAt: "2026-10-05T10:00:00Z" });
    expect(shapeCareStatus([first, second], { profileKind: "ortho" }).override).toMatchObject({ status: "steady", eventId: second.id });

    const cleared = ev({ kind: "override_cleared", createdAt: "2026-10-06T10:00:00Z" });
    expect(shapeCareStatus([first, second, cleared], { profileKind: "ortho" }).override).toBeNull();

    // A new override after the clear is in force again.
    const third = ev({ kind: "status_override", value: "improving", reason: "Back to running pain free", createdAt: "2026-10-09T10:00:00Z" });
    expect(shapeCareStatus([cleared, third, first], { profileKind: "ortho" }).override).toMatchObject({ status: "improving" });
  });

  it("an override and a phase are independent", () => {
    const phase = ev({ kind: "phase", value: "Restore movement", createdAt: "2026-10-01T10:00:00Z" });
    const over = ev({ kind: "status_override", value: "needs_attention", reason: "Red flag discussed today", createdAt: "2026-10-02T10:00:00Z" });
    const cleared = ev({ kind: "override_cleared", createdAt: "2026-10-03T10:00:00Z" });
    const state = shapeCareStatus([phase, over, cleared], { profileKind: "ortho" });
    expect(state.phase?.phase).toBe("Restore movement");
    expect(state.override).toBeNull();
  });

  it("flags an override older than the latest review as stale", () => {
    const over = ev({ kind: "status_override", value: "steady", reason: "Pain flare after a long trip", createdAt: "2026-10-05T10:00:00Z" });
    expect(shapeCareStatus([over], { profileKind: "ortho", latestReviewAt: "2026-10-12T10:00:00Z" }).override?.stale).toBe(true);
    expect(shapeCareStatus([over], { profileKind: "ortho", latestReviewAt: "2026-10-04T10:00:00Z" }).override?.stale).toBe(false);
    expect(shapeCareStatus([over], { profileKind: "ortho" }).override?.stale).toBe(false);
    expect(isOverrideStale("2026-10-05T10:00:00Z", null)).toBe(false);
  });

  it("breaks a tie on the timestamp by id, so the answer is stable", () => {
    const at = "2026-10-05T10:00:00Z";
    const a = { ...ev({ kind: "phase", value: "Settle pain", createdAt: at }), id: "a" };
    const b = { ...ev({ kind: "phase", value: "Strengthen", createdAt: at }), id: "b" };
    expect(orderCareStatusEvents([b, a]).map((e) => e.id)).toEqual(["a", "b"]);
    expect(shapeCareStatus([b, a], { profileKind: "ortho" }).phase?.phase).toBe("Strengthen");
  });
});

describe("parseCareStatusEventRow", () => {
  const row = {
    id: "e1",
    patient_id: "p1",
    kind: "status_override",
    value: "needs_attention",
    reason: "New fall at home yesterday",
    profile_kind: "geriatric",
    set_by: "t1",
    set_by_role: "therapist",
    created_at: "2026-10-01T10:00:00Z",
  };
  it("reads a row into the app's shape", () => {
    expect(parseCareStatusEventRow(row)).toMatchObject({ kind: "status_override", profileKind: "geriatric", setByRole: "therapist" });
  });
  it("refuses a row it cannot vouch for", () => {
    expect(parseCareStatusEventRow({ ...row, kind: "deleted" })).toBeNull();
    expect(parseCareStatusEventRow({ ...row, set_by_role: "patient" })).toBeNull();
    expect(parseCareStatusEventRow({ ...row, profile_kind: "dental" })).toBeNull();
    expect(parseCareStatusEventRow(null)).toBeNull();
  });
});

describe("validateCareStatusChange", () => {
  it("takes one of the profile kind's phases, with an optional note", () => {
    expect(validateCareStatusChange({ action: "set_phase", phase: "Strengthen" }, "ortho")).toEqual({
      ok: true,
      change: { kind: "phase", value: "Strengthen", reason: null },
    });
    expect(validateCareStatusChange({ action: "set_phase", phase: "Strengthen", reason: "  Full range back  " }, "ortho")).toMatchObject({
      ok: true,
      change: { reason: "Full range back" },
    });
    const wrongKind = validateCareStatusChange({ action: "set_phase", phase: "Strengthen" }, "neuro");
    expect(wrongKind.ok).toBe(false);
    expect(validateCareStatusChange({ action: "set_phase", phase: "x".repeat(10), reason: 3 }, "ortho").ok).toBe(false);
  });

  it("requires a reason of at least 10 characters to override the status", () => {
    const short = validateCareStatusChange({ action: "override_status", status: "needs_attention", reason: "fell" }, "ortho");
    expect(short).toMatchObject({ ok: false, code: "reason_required" });
    const missing = validateCareStatusChange({ action: "override_status", status: "steady" }, "ortho");
    expect(missing).toMatchObject({ ok: false, code: "reason_required" });
    const ok = validateCareStatusChange(
      { action: "override_status", status: "needs_attention", reason: "  New fall at   home  yesterday " },
      "geriatric"
    );
    expect(ok).toEqual({ ok: true, change: { kind: "status_override", value: "needs_attention", reason: "New fall at home yesterday" } });
  });

  it("refuses a status that is not a judgement", () => {
    for (const status of ["baseline", "unknown", "great", undefined]) {
      const r = validateCareStatusChange({ action: "override_status", status, reason: "A perfectly long reason" }, "ortho");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBeUndefined();
    }
  });

  it("clears an override with an optional note, and refuses an unknown action", () => {
    expect(validateCareStatusChange({ action: "clear_override" }, "ortho")).toEqual({
      ok: true,
      change: { kind: "override_cleared", value: null, reason: null },
    });
    expect(validateCareStatusChange({ action: "clear_override", reason: "x".repeat(301) }, "ortho").ok).toBe(false);
    expect(validateCareStatusChange({ action: "delete" }, "ortho").ok).toBe(false);
    expect(validateCareStatusChange(null, "ortho").ok).toBe(false);
    expect(validateCareStatusChange([], "ortho").ok).toBe(false);
  });
});

describe("changeIsNoOp and clearHasNothingToEnd", () => {
  const phase = ev({ kind: "phase", value: "Strengthen", createdAt: "2026-10-01T10:00:00Z" });
  const over = ev({ kind: "status_override", value: "steady", reason: "Pain flare after a long trip", createdAt: "2026-10-02T10:00:00Z" });
  const state = shapeCareStatus([phase, over], { profileKind: "ortho" });

  it("the same phase, or the same override and reason, again changes nothing", () => {
    expect(changeIsNoOp({ kind: "phase", value: "Strengthen", reason: null }, state)).toBe(true);
    expect(changeIsNoOp({ kind: "phase", value: "Back to activity", reason: null }, state)).toBe(false);
    expect(changeIsNoOp({ kind: "status_override", value: "steady", reason: "Pain flare after a long trip" }, state)).toBe(true);
    expect(changeIsNoOp({ kind: "status_override", value: "steady", reason: "A different reason now" }, state)).toBe(false);
    expect(changeIsNoOp({ kind: "phase", value: "Strengthen", reason: null }, { phase: null, override: null })).toBe(false);
  });

  it("a clear with no override in force has nothing to end", () => {
    expect(clearHasNothingToEnd({ kind: "override_cleared", value: null, reason: null }, state)).toBe(false);
    expect(clearHasNothingToEnd({ kind: "override_cleared", value: null, reason: null }, { phase: null, override: null })).toBe(true);
    expect(clearHasNothingToEnd({ kind: "phase", value: "Strengthen", reason: null }, { phase: null, override: null })).toBe(false);
  });
});
