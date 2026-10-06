import { describe, expect, it } from "vitest";
import {
  activityFacets,
  eventsFromAdminLog,
  eventsFromReassignments,
  eventsFromSession,
  filterActivity,
  sortActivity,
  type NameLookup,
} from "./activityTimeline";

const people: Record<string, { name: string; role: "patient" | "therapist" | "admin" }> = {
  p1: { name: "Riya", role: "patient" },
  t1: { name: "Dr Arun", role: "therapist" },
  t2: { name: "Dr Meera", role: "therapist" },
  a1: { name: "Asha (admin)", role: "admin" },
};
const lookup: NameLookup = (id) => (id && people[id] ? people[id] : null);

describe("activity timeline", () => {
  const session = eventsFromSession(
    {
      id: "s1",
      session_code: "SS0001",
      patient_id: "p1",
      created_at: "2026-10-01T05:00:00Z",
      slot_time: "2026-10-10T12:30:00Z",
      paid_at: "2026-10-01T05:02:00Z",
      amount_paid_paise: 150000,
      therapist_id: "t2",
      cancelled_at: "2026-10-05T09:00:00Z",
      cancelled_by: "a1",
      cancellation_reason: "Patient asked",
    },
    lookup
  );

  it("turns the appointment's own timestamps into named lines", () => {
    const titles = session.map((e) => [e.title, e.actorRole, e.actorName]);
    expect(titles).toContainEqual(["Session booked", "patient", "Riya"]);
    expect(titles).toContainEqual(["Payment received", "system", null]);
    expect(titles).toContainEqual(["Session cancelled", "admin", "Asha (admin)"]);
    expect(session.find((e) => e.title === "Session booked")?.detail).toMatch(/IST|pm|am/);
    expect(session.every((e) => e.sessionCode === "SS0001")).toBe(true);
  });

  it("says an assignment, a reassignment and a reschedule apart", () => {
    const base = { appointment_id: "s1", changed_by: "a1", changed_at: "2026-10-02T05:00:00Z" };
    const events = eventsFromReassignments(
      [
        { ...base, id: "r1", old_therapist_id: null, new_therapist_id: "t1", old_slot_time: "x", new_slot_time: "x" },
        { ...base, id: "r2", old_therapist_id: "t1", new_therapist_id: "t2", old_slot_time: "x", new_slot_time: "x" },
        { ...base, id: "r3", old_therapist_id: "t2", new_therapist_id: "t2", old_slot_time: "x", new_slot_time: "2026-10-11T12:30:00Z" },
      ],
      lookup
    );
    expect(events.map((e) => e.title)).toEqual(["Assigned to Dr Arun", "Reassigned to Dr Meera", "Rescheduled"]);
  });

  it("labels admin actions the way the activity log does", () => {
    const [e] = eventsFromAdminLog(
      [{ id: "l1", actor_id: "a1", action: "appointment.cancel", target_id: "s1", created_at: "2026-10-05T09:00:00Z" }],
      lookup,
      (a) => (a === "appointment.cancel" ? "Cancelled a session" : a)
    );
    expect(e).toMatchObject({ title: "Cancelled a session", category: "admin", actorName: "Asha (admin)" });
  });

  it("sorts newest first and filters by category, actor, date and text", () => {
    const sorted = sortActivity(session);
    expect(sorted[0].title).toBe("Session cancelled");
    expect(filterActivity(sorted, { categories: ["payment"] }).map((e) => e.title)).toEqual(["Payment received"]);
    expect(filterActivity(sorted, { actorRoles: ["admin"] })).toHaveLength(1);
    expect(filterActivity(sorted, { from: "2026-10-02" }).map((e) => e.title)).toEqual(["Session cancelled"]);
    expect(filterActivity(sorted, { to: "2026-10-01" })).toHaveLength(2);
    expect(filterActivity(sorted, { query: "asked" })).toHaveLength(1);
    expect(activityFacets(sorted).categories).toEqual(["booking", "payment"]);
  });
});
