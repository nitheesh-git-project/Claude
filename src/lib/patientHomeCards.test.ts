import { describe, expect, it } from "vitest";
import { pickHomeProgramme, pickSameAgain, type HomeAppointment, type HomeProgrammePurchase } from "./patientHomeCards";

const active = new Map([
  ["cat-ortho", "Orthopaedic care"],
  ["cat-desk", "Desk and posture care"],
]);
const names = new Map([["th-1", "Dr. Priya Nair"]]);

function appt(p: Partial<HomeAppointment>): HomeAppointment {
  return {
    id: p.id ?? "a",
    slot_time: "2026-11-17T12:30:00Z",
    status: "completed",
    category_id: "cat-ortho",
    therapist_id: "th-1",
    package_purchase_id: null,
    ...p,
  };
}

describe("pickSameAgain", () => {
  it("rebooks the last delivered session with the same physiotherapist", () => {
    const s = pickSameAgain([appt({ id: "a1" })], active, names);
    expect(s?.title).toBe("Orthopaedic care");
    expect(s?.therapistName).toBe("Dr. Priya Nair");
    expect(s?.href).toBe("/book?from=dashboard&category=cat-ortho&therapist=th-1");
  });

  it("prefers a delivered session over an upcoming one, then the latest", () => {
    const s = pickSameAgain(
      [
        appt({ id: "old", category_id: "cat-desk", slot_time: "2026-10-01T10:00:00Z" }),
        appt({ id: "new", slot_time: "2026-11-17T10:00:00Z" }),
        appt({ id: "up", status: "confirmed", category_id: "cat-desk", slot_time: "2026-12-01T10:00:00Z" }),
      ],
      active,
      names
    );
    expect(s?.categoryId).toBe("cat-ortho");
  });

  it("skips programme sessions, no-shows, cancellations and switched-off services", () => {
    expect(
      pickSameAgain(
        [
          appt({ id: "p", package_purchase_id: "pp-1" }),
          appt({ id: "n", no_show: true }),
          appt({ id: "c", status: "cancelled" }),
          appt({ id: "x", category_id: "cat-gone" }),
          appt({ id: "r", status: "requested", payment_status: "unpaid" }),
        ],
        active,
        names
      )
    ).toBeNull();
  });

  it("does not request a physiotherapist it cannot name", () => {
    const s = pickSameAgain([appt({ therapist_id: "th-unknown" })], active, names);
    expect(s?.therapistId).toBeNull();
    expect(s?.href).toBe("/book?from=dashboard&category=cat-ortho");
  });
});

describe("pickHomeProgramme", () => {
  const purchase = (p: Partial<HomeProgrammePurchase>): HomeProgrammePurchase => ({
    id: "pp-1",
    package_id: "pk-1",
    category_id: "cat-ortho",
    status: "active",
    session_count: 6,
    sessions_used: 3,
    locked_therapist_id: "th-1",
    ...p,
  });

  it("shows progress and what is left to book", () => {
    const p = pickHomeProgramme(
      [purchase({})],
      new Map([["pp-1", 2]]),
      new Map([["pp-1", 1]]),
      () => "Back care programme",
      names
    );
    expect(p).toMatchObject({ title: "Back care programme", total: 6, completed: 2, scheduled: 1, toBook: 3, therapistName: "Dr. Priya Nair" });
  });

  it("points at the programme with the most left to book", () => {
    const p = pickHomeProgramme(
      [purchase({ id: "a", sessions_used: 6 }), purchase({ id: "b", sessions_used: 1 })],
      new Map(),
      new Map(),
      (x) => x.id,
      names
    );
    expect(p?.purchaseId).toBe("b");
  });

  it("has no card without an active programme", () => {
    expect(pickHomeProgramme([purchase({ status: "expired" })], new Map(), new Map(), () => "", names)).toBeNull();
  });
});
