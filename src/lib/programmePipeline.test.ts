import { describe, expect, it } from "vitest";
import {
  ALL_STAGES,
  CLOSED_STAGES,
  EMPTY_PROGRAMME_FILTERS,
  PIPELINE_STAGES,
  STAGE_HINT,
  STAGE_LABEL,
  STAGE_TONE,
  buildProgrammeTimeline,
  countStages,
  filterProgrammes,
  filterProgrammesExceptStage,
  filtersFromView,
  hasProgrammeFilters,
  parseProgrammeFilters,
  programmeStage,
  writeProgrammeFilters,
  type ProgrammeRow,
} from "./programmePipeline";

const purchase = (over: Partial<{ status: string; done: number; booked: number; total: number }> = {}) => ({
  status: "active",
  done: 0,
  booked: 0,
  total: 6,
  ...over,
});

describe("programmeStage", () => {
  it("walks the pipeline in order", () => {
    expect(programmeStage({ planState: "pending_review", purchase: null })).toBe("waiting_approval");
    expect(programmeStage({ planState: "awaiting_patient", purchase: null })).toBe("with_patient");
    expect(programmeStage({ planState: "accepted", purchase: purchase() })).toBe("paid_unbooked");
    expect(programmeStage({ planState: "accepted", purchase: purchase({ booked: 1 }) })).toBe("in_progress");
    expect(programmeStage({ planState: "accepted", purchase: purchase({ done: 1 }) })).toBe("in_progress");
    expect(programmeStage({ planState: "accepted", purchase: purchase({ done: 6 }) })).toBe("completed");
    expect(programmeStage({ planState: null, purchase: purchase({ status: "completed", done: 4 }) })).toBe("completed");
  });

  it("names every way a programme stops", () => {
    expect(programmeStage({ planState: "declined", purchase: null })).toBe("declined");
    expect(programmeStage({ planState: "rejected", purchase: null })).toBe("not_approved");
    expect(programmeStage({ planState: "withdrawn", purchase: null })).toBe("withdrawn");
    expect(programmeStage({ planState: "superseded", purchase: null })).toBe("withdrawn");
    expect(programmeStage({ planState: "lapsed", purchase: null })).toBe("lapsed");
    expect(programmeStage({ planState: null, purchase: purchase({ status: "expired", done: 2 }) })).toBe("expired");
    expect(programmeStage({ planState: null, purchase: purchase({ status: "refunded", done: 2 }) })).toBe("refunded");
    expect(programmeStage({ planState: null, purchase: purchase({ status: "cancelled" }) })).toBe("refunded");
  });

  it("reads a purchase ahead of the recommendation it came from", () => {
    // The plan says accepted; the purchase says what is actually happening.
    expect(programmeStage({ planState: "accepted", purchase: purchase({ status: "expired" }) })).toBe("expired");
    // Accepted with the purchase not in view still reads as paid.
    expect(programmeStage({ planState: "accepted", purchase: null })).toBe("paid_unbooked");
  });

  it("has a label, a hint and a colour for every stage", () => {
    expect(ALL_STAGES).toHaveLength(PIPELINE_STAGES.length + CLOSED_STAGES.length);
    for (const s of ALL_STAGES) {
      expect(STAGE_LABEL[s]).toBeTruthy();
      expect(STAGE_HINT[s]).toBeTruthy();
      expect(STAGE_TONE[s]).toBeTruthy();
    }
  });
});

function row(over: Partial<ProgrammeRow>): ProgrammeRow {
  return {
    key: "plan:1",
    code: "PED_PKG001",
    display: "PED_PKG001-0/6",
    otherCodes: [],
    carePlanId: "1",
    purchaseId: null,
    purchaseKind: null,
    mode: "online",
    conditionId: "c-ped",
    conditionTitle: "Paediatric",
    patientId: "p1",
    patientName: "Asha Rao",
    therapistId: "t1",
    therapistName: "Dr Meera",
    authorName: "Dr Meera",
    stage: "with_patient",
    done: 0,
    booked: 0,
    total: 6,
    createdAt: "2026-10-01T06:00:00Z",
    paidAt: null,
    expiresAt: null,
    nextSession: null,
    sessions: [],
    timeline: [],
    money: null,
    paymentMode: null,
    rationale: null,
    declineReason: null,
    reviewReason: null,
    ...over,
  };
}

describe("filters", () => {
  const rows = [
    row({ key: "a" }),
    row({
      key: "b",
      code: "ORT_HV002",
      otherCodes: ["HS0007"],
      mode: "home_visit",
      conditionId: "c-ort",
      conditionTitle: "Orthopaedic",
      patientName: "Ravi Kumar",
      therapistId: "t2",
      therapistName: "Dr Arjun",
      stage: "in_progress",
      createdAt: "2026-10-05T20:00:00Z", // 6 Oct in the clinic's zone
      sessions: [{ id: "s", sessionCode: "HV0044", status: "completed", slotTime: null, therapistName: null, createdAt: null, completedAt: null }],
    }),
    row({ key: "c", code: "PED_PKG002", stage: "declined" }),
  ];

  it("searches the new ID, its displayed form, the old code, a name and a session code", () => {
    const find = (q: string) => filterProgrammes(rows, { ...EMPTY_PROGRAMME_FILTERS, q }).map((r) => r.key);
    expect(find("PED_PKG001")).toEqual(["a"]);
    expect(find("ORT_HV002-1/4")).toEqual(["b"]);
    expect(find("hs0007")).toEqual(["b"]);
    expect(find("ravi")).toEqual(["b"]);
    expect(find("arjun")).toEqual(["b"]);
    expect(find("HV0044")).toEqual(["b"]);
    expect(find("PED_PKG")).toEqual(["a", "c"]);
  });

  it("filters by stage, open, condition, therapist, mode and clinic-zone dates", () => {
    const f = (over: Partial<typeof EMPTY_PROGRAMME_FILTERS>) =>
      filterProgrammes(rows, { ...EMPTY_PROGRAMME_FILTERS, ...over }).map((r) => r.key);
    expect(f({ stage: "in_progress" })).toEqual(["b"]);
    expect(f({ stage: "open" })).toEqual(["a", "b"]);
    expect(f({ condition: "c-ort" })).toEqual(["b"]);
    expect(f({ therapist: "t1" })).toEqual(["a", "c"]);
    expect(f({ mode: "home_visit" })).toEqual(["b"]);
    expect(f({ from: "2026-10-06" })).toEqual(["b"]);
    expect(f({ to: "2026-10-05" })).toEqual(["a", "c"]);
  });

  it("holds only programmes paid long enough ago with nothing booked", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    const paid = [
      row({ key: "old", stage: "paid_unbooked", paidAt: "2026-10-08T11:00:00Z" }),
      row({ key: "new", stage: "paid_unbooked", paidAt: "2026-10-10T06:00:00Z" }),
      row({ key: "busy", stage: "in_progress", paidAt: "2026-10-01T06:00:00Z" }),
    ];
    const f = (late: string) => filterProgrammes(paid, { ...EMPTY_PROGRAMME_FILTERS, late }, now).map((r) => r.key);
    expect(f("24")).toEqual(["old"]);
    expect(f("48")).toEqual(["old"]);
    expect(f("50")).toEqual([]);
    expect(f("")).toEqual(["old", "new", "busy"]);
  });

  it("counts the pipeline over every filter but the stage", () => {
    const counted = countStages(
      filterProgrammesExceptStage(rows, { ...EMPTY_PROGRAMME_FILTERS, stage: "declined", condition: "c-ped" })
    );
    expect(counted.with_patient).toBe(1);
    expect(counted.declined).toBe(1);
    expect(counted.in_progress).toBe(0);
  });

  it("round-trips through the URL and ignores what it cannot read", () => {
    const filters = { ...EMPTY_PROGRAMME_FILTERS, q: "PED_PKG001", stage: "completed" as const, mode: "online" as const, from: "2026-10-01" };
    const params = writeProgrammeFilters(new URLSearchParams("section=programmes&tab=all"), filters);
    expect(params.get("section")).toBe("programmes");
    expect(parseProgrammeFilters(params)).toEqual(filters);
    expect(parseProgrammeFilters(new URLSearchParams("pg_stage=bogus&pg_mode=car&pg_from=yesterday"))).toEqual(
      EMPTY_PROGRAMME_FILTERS
    );
    expect(hasProgrammeFilters(EMPTY_PROGRAMME_FILTERS)).toBe(false);
    writeProgrammeFilters(params, EMPTY_PROGRAMME_FILTERS);
    expect([...params.keys()]).toEqual(["section", "tab"]);
  });

  it("reads the one-shot presets other screens link with", () => {
    expect(filtersFromView("stage:waiting_approval")?.stage).toBe("waiting_approval");
    expect(filtersFromView("unscheduled")).toMatchObject({ stage: "paid_unbooked", late: "24" });
    expect(filtersFromView("late:48")).toMatchObject({ stage: "paid_unbooked", late: "48" });
    expect(filtersFromView("code:PED_PKG001")?.q).toBe("PED_PKG001");
    expect(filtersFromView("nonsense")).toEqual(EMPTY_PROGRAMME_FILTERS);
    expect(filtersFromView(null)).toBeNull();
  });
});

describe("buildProgrammeTimeline", () => {
  it("tells the story oldest first, from recommendation to refund", () => {
    const events = buildProgrammeTimeline({
      versions: [
        { authoredAt: "2026-10-01T05:00:00Z", versionNo: 1, byClinic: false, authorName: "Dr Meera" },
        { authoredAt: "2026-10-01T07:00:00Z", versionNo: 2, byClinic: true, authorName: "Dr Meera" },
      ],
      reviews: [{ at: "2026-10-01T07:00:01Z", decision: "edited_and_approved", reviewerName: "Admin", reason: "Fewer sessions to start" }],
      sentAt: "2026-10-01T07:00:02Z",
      acceptedAt: "2026-10-02T05:00:00Z",
      declinedAt: null,
      declineReason: null,
      withdrawnAt: null,
      lapsedAt: null,
      paidAt: "2026-10-02T05:00:00Z",
      paidLabel: "₹2,994",
      sessions: [
        { id: "s1", sessionCode: "SS0101", status: "completed", slotTime: "2026-10-04T05:00:00Z", therapistName: "Dr Meera", createdAt: "2026-10-02T06:00:00Z", completedAt: "2026-10-04T06:00:00Z" },
        { id: "s2", sessionCode: "SS0102", status: "requested", slotTime: "2026-10-08T05:00:00Z", therapistName: null, createdAt: "2026-10-02T06:00:05Z", completedAt: null },
      ],
      expiredAt: null,
      refundedAt: "2026-10-09T05:00:00Z",
      refundLabel: "₹1,497",
    });
    expect(events.map((e) => e.kind)).toEqual([
      "written",
      "rewritten",
      "approved",
      "sent",
      "accepted",
      "paid",
      "booked",
      "booked",
      "completed_session",
      "refunded",
    ]);
    expect(events[0].label).toBe("Recommended by Dr Meera");
    expect(events[1].label).toBe("Changed by the clinic");
    expect(events[2].detail).toBe("Fewer sessions to start");
    expect(events[7].detail).toBe("Waiting for a therapist");
  });

  it("drops events with no readable time rather than inventing one", () => {
    const events = buildProgrammeTimeline({
      versions: [{ authoredAt: "not a date", versionNo: 1, byClinic: false, authorName: null }],
      reviews: [{ at: "2026-10-01T07:00:00Z", decision: "rejected", reviewerName: null, reason: "Patient has sessions left" }],
      sentAt: null,
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      withdrawnAt: null,
      lapsedAt: null,
      paidAt: null,
      paidLabel: null,
      sessions: [],
      expiredAt: null,
      refundedAt: null,
      refundLabel: null,
    });
    expect(events).toEqual([
      { at: "2026-10-01T07:00:00Z", kind: "rejected", label: "Not approved", detail: "Patient has sessions left" },
    ]);
  });
});
