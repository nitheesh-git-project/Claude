import { describe, expect, it } from "vitest";
import {
  SESSION_SUMMARY_MAX_CHARS,
  SESSION_SUMMARY_SELECT,
  isSummaryEditable,
  patientSummaryState,
  sameSummaryText,
  summaryPlanHref,
  validateSessionSummary,
  type SessionSummaryRow,
} from "./sessionSummary";
import { SESSION_NOTE_FIELDS } from "./sessionNotes";

const PATIENT = "11111111-1111-1111-1111-111111111111";
const OTHER_PATIENT = "22222222-2222-2222-2222-222222222222";
const SESSION = "33333333-3333-3333-3333-333333333333";

function row(patch: Partial<SessionSummaryRow> = {}): SessionSummaryRow {
  return {
    id: "s1",
    appointment_id: SESSION,
    patient_id: PATIENT,
    therapist_id: "t1",
    what_we_did: "Knee bends and sit-to-stand practice.",
    before_next_time: "Heel slides, 10 twice a day.",
    created_at: "2026-10-18T10:00:00.000Z",
    updated_at: null,
    ...patch,
  };
}

const completed = { id: SESSION, status: "completed", no_show: false, patient_id: PATIENT };

describe("validateSessionSummary", () => {
  it("trims both fields and reports an empty summary as empty", () => {
    expect(validateSessionSummary({ whatWeDid: "  Walked  ", beforeNextTime: "" })).toEqual({
      ok: true,
      value: { whatWeDid: "Walked", beforeNextTime: null },
      empty: false,
    });
    expect(validateSessionSummary({})).toEqual({
      ok: true,
      value: { whatWeDid: null, beforeNextTime: null },
      empty: true,
    });
  });

  it("refuses anything that is not text, and anything over the cap", () => {
    expect(validateSessionSummary({ whatWeDid: 42 }).ok).toBe(false);
    expect(validateSessionSummary({ beforeNextTime: ["a"] }).ok).toBe(false);
    expect(validateSessionSummary({ whatWeDid: "x".repeat(SESSION_SUMMARY_MAX_CHARS) }).ok).toBe(true);
    expect(validateSessionSummary({ whatWeDid: "x".repeat(SESSION_SUMMARY_MAX_CHARS + 1) }).ok).toBe(false);
  });
});

describe("patientSummaryState: what a patient may see", () => {
  it("shows the summary of their own delivered session, attributed and dated", () => {
    const state = patientSummaryState({
      session: completed,
      viewerId: PATIENT,
      summary: row(),
      loadFailed: false,
      therapistName: "Asha Rao",
    });
    expect(state).toEqual({
      kind: "summary",
      whatWeDid: "Knee bends and sit-to-stand practice.",
      beforeNextTime: "Heel slides, 10 twice a day.",
      writtenBy: "Asha Rao",
      writtenAt: "2026-10-18T10:00:00.000Z",
      updatedAt: null,
      planHref: null,
    });
  });

  it("never renders a summary that belongs to another patient or another session", () => {
    expect(
      patientSummaryState({ session: completed, viewerId: PATIENT, summary: row({ patient_id: OTHER_PATIENT }), loadFailed: false, therapistName: null }).kind
    ).toBe("none");
    expect(
      patientSummaryState({ session: completed, viewerId: PATIENT, summary: row({ appointment_id: "other" }), loadFailed: false, therapistName: null }).kind
    ).toBe("none");
    expect(
      patientSummaryState({
        session: { ...completed, patient_id: OTHER_PATIENT },
        viewerId: PATIENT,
        summary: row({ patient_id: OTHER_PATIENT }),
        loadFailed: false,
        therapistName: null,
      }).kind
    ).toBe("hidden");
  });

  it("carries only the summary's own fields, whatever else the row holds", () => {
    const leaky = { ...row(), data: { treated: "PRIVATE CLINICAL NOTE" }, free_text: "PRIVATE" } as SessionSummaryRow;
    const state = patientSummaryState({ session: completed, viewerId: PATIENT, summary: leaky, loadFailed: false, therapistName: "A" });
    expect(JSON.stringify(state)).not.toContain("PRIVATE");
  });

  it("says nothing on a session that was not delivered", () => {
    for (const session of [
      { ...completed, status: "confirmed" },
      { ...completed, status: "cancelled" },
      { ...completed, no_show: true },
    ]) {
      expect(patientSummaryState({ session, viewerId: PATIENT, summary: row(), loadFailed: false, therapistName: null }).kind).toBe("hidden");
    }
  });

  it("keeps a failed read apart from a summary that was never written", () => {
    expect(patientSummaryState({ session: completed, viewerId: PATIENT, summary: null, loadFailed: true, therapistName: null }).kind).toBe("unavailable");
    expect(patientSummaryState({ session: completed, viewerId: PATIENT, summary: null, loadFailed: false, therapistName: null }).kind).toBe("none");
    expect(
      patientSummaryState({ session: completed, viewerId: PATIENT, summary: row({ what_we_did: " ", before_next_time: null }), loadFailed: false, therapistName: null }).kind
    ).toBe("none");
  });

  it("falls back to a neutral author when the name could not be read", () => {
    const state = patientSummaryState({ session: completed, viewerId: PATIENT, summary: row(), loadFailed: false, therapistName: null });
    expect(state.kind === "summary" && state.writtenBy).toBe("Your therapist");
  });
});

describe("the summary never reads the private note", () => {
  it("selects no session-note field", () => {
    const columns = SESSION_SUMMARY_SELECT.split(",").map((c) => c.trim());
    for (const field of SESSION_NOTE_FIELDS) expect(columns).not.toContain(field.key);
    expect(columns).not.toContain("data");
    expect(columns).not.toContain("free_text");
  });
});

describe("summaryPlanHref", () => {
  it("links a programme recommended after this session, once the patient may see it", () => {
    expect(summaryPlanHref(SESSION, [{ sourceAppointmentId: SESSION, planStatus: "active" }])).toBe("/patient/dashboard/suggested");
    expect(summaryPlanHref(SESSION, [{ sourceAppointmentId: SESSION, planStatus: "accepted" }])).toBe("/patient/dashboard/suggested");
  });

  it("does not mention one waiting on the clinic, turned down, or from another session", () => {
    expect(summaryPlanHref(SESSION, [{ sourceAppointmentId: SESSION, planStatus: "pending_review" }])).toBeNull();
    expect(summaryPlanHref(SESSION, [{ sourceAppointmentId: SESSION, planStatus: "rejected" }])).toBeNull();
    expect(summaryPlanHref(SESSION, [{ sourceAppointmentId: "other", planStatus: "active" }])).toBeNull();
  });
});

describe("editing", () => {
  it("is open for the note's 24-hour window and then closes", () => {
    const written = Date.parse("2026-10-18T10:00:00.000Z");
    expect(isSummaryEditable(row(), written + 23 * 3600_000)).toBe(true);
    expect(isSummaryEditable(row(), written + 24 * 3600_000)).toBe(false);
    expect(isSummaryEditable(row({ created_at: "garbage" }), written)).toBe(false);
  });

  it("treats a blank and a missing field as the same text", () => {
    expect(sameSummaryText({ whatWeDid: "a", beforeNextTime: null }, { whatWeDid: "a", beforeNextTime: null })).toBe(true);
    expect(sameSummaryText({ whatWeDid: "a", beforeNextTime: null }, { whatWeDid: "a", beforeNextTime: "b" })).toBe(false);
  });
});
