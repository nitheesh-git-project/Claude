import { describe, it, expect } from "vitest";
import {
  EMPTY_SUBJECT_FILTERS,
  LOG_ACTOR_ROLES,
  LOG_ROLE_LABEL,
  LOG_ROLE_TONE,
  USER_ACTIVITY_META,
  UUID_RE,
  buildUserActivitySummary,
  distinctValues,
  hasSubjectFilters,
  isUserActivityAction,
  matchesSubjectFilters,
  mergeActivityRows,
  parseSubjectFilters,
  rowRole,
  userActivityGroup,
  userActivityLabel,
  writeSubjectFilters,
} from "@/lib/userActivity";
import {
  EMPTY_ACTIVITY_FILTERS,
  activityCategory,
  activityCategoriesPresent,
  activityCategoryLabel,
  filterActivityRows,
  hasActivityFilters,
  matchesActivityQuery,
  parseActivityFilters,
  writeActivityFilters,
} from "@/lib/activityLog";

describe("roles", () => {
  it("gives every role a label and a distinct chip", () => {
    const tones = new Set<string>();
    for (const role of LOG_ACTOR_ROLES) {
      expect(LOG_ROLE_LABEL[role]).toBeTruthy();
      tones.add(LOG_ROLE_TONE[role]);
    }
    expect(tones.size).toBe(LOG_ACTOR_ROLES.length);
  });

  it("reads a row with no role as an admin", () => {
    expect(rowRole({})).toBe("admin");
    expect(rowRole({ actorRole: "patient" })).toBe("patient");
  });
});

describe("the action vocabulary", () => {
  it("labels and groups every action", () => {
    for (const action of Object.keys(USER_ACTIVITY_META)) {
      expect(isUserActivityAction(action), action).toBe(true);
      expect(userActivityLabel(action), action).toBeTruthy();
      expect(userActivityGroup(action), action).toBeTruthy();
      // a user action is never mistaken for an admin one
      expect(activityCategory(action), action).not.toBe("full_only");
      expect(activityCategory(action), action).not.toBe("other");
    }
  });

  it("does not claim an admin or unknown action", () => {
    expect(isUserActivityAction("refund.issue")).toBe(false);
    expect(isUserActivityAction("toString")).toBe(false);
    expect(userActivityLabel("nope")).toBeNull();
  });

  it("shows the group as the type, only for groups that have entries", () => {
    expect(activityCategoryLabel(activityCategory("appointment.cancelled"))).toBe("Booking");
    const present = activityCategoriesPresent([{ action: "payment.captured" }, { action: "refund.issue" }]);
    expect(present).toContain("payment");
    expect(present).not.toContain("booking");
  });
});

describe("buildUserActivitySummary", () => {
  it("names the actor, the session, the programme and who it was with", () => {
    expect(
      buildUserActivitySummary("appointment.cancelled", {
        actorRole: "patient",
        actorName: "Asha Rao",
        therapistName: "Dr Mehta",
        sessionCode: "MR-0042",
        programmeCode: "PED_PKG001",
        conditionName: "Knee pain",
      })
    ).toBe(
      "Asha Rao cancelled a session (session MR-0042, programme PED_PKG001, with Dr Mehta, condition Knee pain)"
    );
  });

  it("names the patient when somebody else acted on their behalf", () => {
    expect(
      buildUserActivitySummary("session_note.written", {
        actorRole: "therapist",
        actorName: "Dr Mehta",
        patientName: "Asha Rao",
      })
    ).toBe("Dr Mehta wrote a session note (for Asha Rao)");
  });

  it("falls back to the role when the name is unknown, and formats money", () => {
    expect(buildUserActivitySummary("payout.requested", { actorRole: "therapist", amountPaise: 123450 })).toBe(
      "A therapist asked for a payout (₹1234.50)"
    );
    expect(buildUserActivitySummary("account.created", { actorRole: "system" })).toBe("The system created an account");
  });

  it("is capped so it fits the column", () => {
    const long = "x".repeat(600);
    expect(buildUserActivitySummary("session.completed", { actorRole: "therapist", actorName: long }).length).toBe(400);
  });
});

const rows = [
  {
    id: "1",
    actorName: "Asha Rao",
    actorRole: "patient" as const,
    action: "appointment.cancelled",
    targetLabel: null,
    createdAt: "2026-10-01T10:00:00Z",
    patientName: "Asha Rao",
    therapistName: "Dr Mehta",
    programmeCode: "PED_PKG001",
    sessionCode: "MR-0042",
    conditionName: "Knee pain",
    summary: "Asha Rao cancelled a session",
  },
  {
    id: "2",
    actorName: "Dr Mehta",
    actorRole: "therapist" as const,
    action: "session.completed",
    targetLabel: null,
    createdAt: "2026-10-02T10:00:00Z",
    patientName: "Ravi Kumar",
    therapistName: "Dr Mehta",
    programmeCode: "SHD_PKG002",
    conditionName: "Shoulder pain",
  },
  {
    id: "3",
    actorName: "Vik Shah",
    action: "refund.issue",
    targetLabel: "Asha Rao",
    createdAt: "2026-10-03T10:00:00Z",
    patientName: "Asha Rao",
    programmeCode: null,
    conditionName: null,
  },
];

describe("matchesSubjectFilters", () => {
  const ids = (f: Partial<typeof EMPTY_SUBJECT_FILTERS>) =>
    rows.filter((r) => matchesSubjectFilters(r, { ...EMPTY_SUBJECT_FILTERS, ...f })).map((r) => r.id);

  it("matches nothing narrower than everything by default", () => {
    expect(ids({})).toEqual(["1", "2", "3"]);
  });
  it("filters by actor role, treating a role-less row as an admin", () => {
    expect(ids({ role: "patient" })).toEqual(["1"]);
    expect(ids({ role: "therapist" })).toEqual(["2"]);
    expect(ids({ role: "admin" })).toEqual(["3"]);
  });
  it("filters by actor name, patient and therapist on any word", () => {
    expect(ids({ person: "mehta" })).toEqual(["2"]);
    expect(ids({ patient: "asha" })).toEqual(["1", "3"]);
    expect(ids({ therapist: "dr mehta" })).toEqual(["1", "2"]);
  });
  it("filters by programme ID without case or spacing, by prefix too", () => {
    expect(ids({ programme: "ped_pkg001" })).toEqual(["1"]);
    expect(ids({ programme: "PED PKG001" })).toEqual(["1"]);
    expect(ids({ programme: "pkg" })).toEqual(["1", "2"]);
  });
  it("never matches a row with no programme against a programme filter", () => {
    expect(ids({ programme: "PED" })).not.toContain("3");
  });
  it("filters by condition exactly", () => {
    expect(ids({ condition: "knee pain" })).toEqual(["1"]);
    expect(ids({ condition: "Knee" })).toEqual([]);
  });
  it("combines filters", () => {
    expect(ids({ role: "patient", patient: "asha", programme: "PED" })).toEqual(["1"]);
    expect(ids({ role: "therapist", patient: "asha" })).toEqual([]);
  });
});

describe("the feed's filters through filterActivityRows", () => {
  it("applies subject filters alongside the existing ones", () => {
    expect(
      filterActivityRows(rows, { ...EMPTY_ACTIVITY_FILTERS, role: "patient", fromDate: "2026-10-01" }).map((r) => r.id)
    ).toEqual(["1"]);
    expect(filterActivityRows(rows, { ...EMPTY_ACTIVITY_FILTERS, moneyOnly: true }).map((r) => r.id)).toEqual(["3"]);
  });

  it("finds an entry by a programme ID, a patient, or the stored sentence in the search box", () => {
    expect(matchesActivityQuery(rows[0], "PED_PKG001")).toBe(true);
    expect(matchesActivityQuery(rows[0], "mehta knee")).toBe(true);
    expect(matchesActivityQuery(rows[0], "cancelled a session")).toBe(true);
    expect(matchesActivityQuery(rows[1], "PED_PKG001")).toBe(false);
  });
});

describe("filters in the URL", () => {
  it("round-trips every filter", () => {
    const filters = {
      ...EMPTY_ACTIVITY_FILTERS,
      role: "patient" as const,
      person: "asha",
      programme: "PED_PKG001",
      patient: "Asha",
      therapist: "Mehta",
      condition: "Knee pain",
      query: "cancel",
      category: "booking" as const,
      moneyOnly: true,
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    };
    const params = writeActivityFilters(new URLSearchParams("section=logs&tab=all"), filters);
    expect(params.get("section")).toBe("logs");
    expect(params.get("al_prog")).toBe("PED_PKG001");
    expect(parseActivityFilters(params)).toEqual(filters);
  });

  it("removes a filter that is switched off and ignores junk", () => {
    const params = new URLSearchParams("al_role=patient&al_prog=PED&al_from=bad&al_role2=x");
    writeSubjectFilters(params, { ...EMPTY_SUBJECT_FILTERS, role: "patient" });
    expect(params.has("al_prog")).toBe(false);
    expect(parseSubjectFilters(new URLSearchParams("al_role=superuser")).role).toBe("");
    expect(parseActivityFilters(new URLSearchParams("al_from=bad")).fromDate).toBe("");
  });

  it("knows when nothing is filtered", () => {
    expect(hasActivityFilters(EMPTY_ACTIVITY_FILTERS)).toBe(false);
    expect(hasActivityFilters({ ...EMPTY_ACTIVITY_FILTERS, therapist: "x" })).toBe(true);
    expect(hasSubjectFilters(EMPTY_SUBJECT_FILTERS)).toBe(false);
  });
});

describe("mergeActivityRows", () => {
  it("merges newest-first, drops duplicates and cuts to the limit", () => {
    const a = [
      { id: "a1", createdAt: "2026-10-03T00:00:00Z" },
      { id: "a2", createdAt: "2026-10-01T00:00:00Z" },
    ];
    const b = [
      { id: "b1", createdAt: "2026-10-02T00:00:00Z" },
      { id: "a1", createdAt: "2026-10-03T00:00:00Z" },
    ];
    expect(mergeActivityRows([a, b], 10).map((r) => r.id)).toEqual(["a1", "b1", "a2"]);
    expect(mergeActivityRows([a, b], 2).map((r) => r.id)).toEqual(["a1", "b1"]);
  });
});

describe("helpers", () => {
  it("lists distinct sorted values", () => {
    expect(distinctValues(["b", " a ", null, "b", undefined, ""])).toEqual(["a", "b"]);
  });
  it("accepts only real uuids for the subject filter", () => {
    expect(UUID_RE.test("0b6f4c0e-6d6a-4c53-9b1e-0123456789ab")).toBe(true);
    expect(UUID_RE.test("1,patient_id.neq.2")).toBe(false);
  });
});
