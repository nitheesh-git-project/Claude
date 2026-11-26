import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  filterRatings,
  ratingRowsFrom,
  summariseRatings,
  type PersonLite,
  type RatedAppointment,
} from "@/lib/sessionRatings";

const people = new Map<string, PersonLite>([
  ["p1", { id: "p1", full_name: "Asha Rao", email: "asha@gmail.com", phone: "+919800000001", patient_code: "PT0001" }],
  ["t1", { id: "t1", full_name: "Dr Meera", email: "meera@clinic.in", phone: null, therapist_code: "TH0007" }],
]);
const base: RatedAppointment = {
  id: "a1",
  session_code: "SS0042",
  patient_id: "p1",
  therapist_id: "t1",
  slot_time: "2026-11-20T10:00:00Z",
  status: "completed",
  visit_mode: "online",
  duration_minutes: 45,
  category_id: "c1",
  patient_rating: 5,
  patient_feedback: "Clear explanations · Great session",
  patient_feedback_at: "2026-11-20T12:00:00Z",
  patient_rating_excluded: false,
  therapist_rating: 2,
  therapist_feedback: "Joined late",
  therapist_feedback_at: "2026-11-20T13:00:00Z",
  therapist_rating_excluded: true,
};
const rows = ratingRowsFrom([base, { ...base, id: "a2", session_code: "SS0043", therapist_rating: null, patient_rating: 1 }], people, new Map([["c1", "Knee"]]));

describe("ratingRowsFrom", () => {
  it("makes one row per rating, newest first, with every id and code", () => {
    expect(rows.map((r) => r.key).sort()).toEqual(["a1:patient", "a1:therapist", "a2:patient"]);
    expect(rows).toHaveLength(3);
    expect(rows[0].side).toBe("therapist");
    const r = rows[0];
    expect(r.patient).toMatchObject({ id: "p1", code: "PT0001", name: "Asha Rao", email: "asha@gmail.com" });
    expect(r.therapist).toMatchObject({ id: "t1", code: "TH0007", name: "Dr Meera" });
    expect(r.sessionCode).toBe("SS0042");
    expect(r.appointmentId).toBe("a1");
    expect(r.treatment).toBe("Knee");
  });
  it("skips a side that has not rated", () => {
    expect(rows.filter((r) => r.appointmentId === "a2")).toHaveLength(1);
  });
});

describe("filterRatings", () => {
  it("filters by side, stars, counting and notes", () => {
    expect(filterRatings(rows, { ...NO_FILTERS, side: "patient" })).toHaveLength(2);
    expect(filterRatings(rows, { ...NO_FILTERS, stars: 5 })).toHaveLength(1);
    expect(filterRatings(rows, { ...NO_FILTERS, stars: -1 })).toHaveLength(2);
    expect(filterRatings(rows, { ...NO_FILTERS, counting: "excluded" })).toHaveLength(1);
    expect(filterRatings(rows, { ...NO_FILTERS, counting: "counted" })).toHaveLength(2);
    expect(filterRatings(rows, { ...NO_FILTERS, withNote: true })).toHaveLength(3);
  });
  it("finds a rating by a code, a name, a contact or an id", () => {
    for (const q of ["ss0042", "PT0001", "th0007", "meera", "asha@gmail", "a2", "p1"]) {
      expect(filterRatings(rows, { ...NO_FILTERS, query: q }).length, q).toBeGreaterThan(0);
    }
    expect(filterRatings(rows, { ...NO_FILTERS, query: "zzz" })).toHaveLength(0);
  });
});

describe("summariseRatings", () => {
  it("leaves an excluded rating out of the average, as the public average does", () => {
    expect(summariseRatings(rows)).toEqual({ count: 3, average: 3, lowCount: 2, withNote: 3, excluded: 1 });
    expect(summariseRatings([]).average).toBeNull();
  });
});

describe("the ratings screen's route and tab", () => {
  it("is read-only, guarded by the Sessions scope, and the tab is in the menu and the content map", async () => {
    const { readFileSync } = await import("node:fs");
    const route = readFileSync("src/app/api/admin/session-ratings/route.ts", "utf8");
    expect(route).toContain('requireAdminScope("sessions")');
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(readFileSync("src/lib/adminNav.ts", "utf8")).toContain('key: "ratings"');
    expect(readFileSync("src/app/admin/dashboard/page.tsx", "utf8")).toContain('"sessions:ratings"');
  });
});
