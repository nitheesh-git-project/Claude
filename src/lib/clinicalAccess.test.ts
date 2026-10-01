import { describe, it, expect } from "vitest";
import {
  appointmentGrantsClinicalAccess,
  clinicalAccessHolders,
  programmeLockGrantsClinicalAccess,
  describeAccessReason,
  type ClinicalAccessSource,
  type TherapistStanding,
} from "./clinicalAccess";

const standing = (entries: Record<string, TherapistStanding> = {}) =>
  new Map(Object.entries(entries));

describe("clinicalAccessHolders", () => {
  it("counts a therapist's sessions and keeps the most recent", () => {
    const sources: ClinicalAccessSource[] = [
      { therapistId: "t1", slotTime: "2026-01-10T10:00:00Z" },
      { therapistId: "t1", slotTime: "2026-03-02T10:00:00Z" },
      { therapistId: "t1", slotTime: "2026-02-01T10:00:00Z" },
    ];
    const [held] = clinicalAccessHolders(sources, standing());
    expect(held.sessionCount).toBe(3);
    expect(held.lastSessionAt).toBe("2026-03-02T10:00:00Z");
  });

  // The whole point of the panel: a therapist who treated this patient a year
  // ago still reads their record, and nothing in the product said so.
  it("lists a therapist whose last session was long ago", () => {
    const holders = clinicalAccessHolders(
      [
        { therapistId: "current", slotTime: "2026-03-02T10:00:00Z" },
        { therapistId: "former", slotTime: "2025-01-04T10:00:00Z" },
      ],
      standing()
    );
    expect(holders.map((h) => h.therapistId)).toEqual(["current", "former"]);
  });

  // A programme lock grants access on its own, with no session behind it.
  it("counts a programme lock as its own reason", () => {
    const [held] = clinicalAccessHolders(
      [{ therapistId: "t1", viaProgrammeLock: true }],
      standing()
    );
    expect(held.viaProgrammeLock).toBe(true);
    expect(held.sessionCount).toBe(0);
    expect(held.lastSessionAt).toBeNull();
  });

  // Listed rather than dropped. Silently omitting a suspended therapist
  // would make a suspension look like a deletion, on the one screen whose
  // job is to say who has a relationship with this record.
  it("lists a suspended or unapproved therapist, and marks them", () => {
    const holders = clinicalAccessHolders(
      [
        { therapistId: "suspended", slotTime: "2026-02-01T10:00:00Z" },
        { therapistId: "pending", slotTime: "2026-01-01T10:00:00Z" },
        { therapistId: "ok", slotTime: "2026-03-01T10:00:00Z" },
      ],
      standing({
        suspended: { approved: true, active: false },
        pending: { approved: false, active: true },
        ok: { approved: true, active: true },
      })
    );
    expect(holders).toHaveLength(3);
    expect(holders.find((h) => h.therapistId === "suspended")!.active).toBe(false);
    expect(holders.find((h) => h.therapistId === "pending")!.active).toBe(false);
    expect(holders.find((h) => h.therapistId === "ok")!.active).toBe(true);
  });

  // An unreadable date must never become "the most recent" by accident --
  // the same rule sessionOrdering follows, and for the same reason: it would
  // leave the list in an arbitrary order with no error anywhere.
  it("does not let an unreadable date win", () => {
    const [held] = clinicalAccessHolders(
      [
        { therapistId: "t1", slotTime: "2026-01-10T10:00:00Z" },
        { therapistId: "t1", slotTime: "not a date" },
      ],
      standing()
    );
    expect(held.lastSessionAt).toBe("2026-01-10T10:00:00Z");
    expect(held.sessionCount).toBe(2);
  });

  it("puts a lock-only holder after everybody with a dated session", () => {
    const holders = clinicalAccessHolders(
      [
        { therapistId: "locked", viaProgrammeLock: true },
        { therapistId: "seen", slotTime: "2020-01-01T10:00:00Z" },
      ],
      standing()
    );
    expect(holders.map((h) => h.therapistId)).toEqual(["seen", "locked"]);
  });

  it("is empty for a patient nobody has treated", () => {
    expect(clinicalAccessHolders([], standing())).toEqual([]);
  });

  // A row with no therapist is not a holder, and inventing one would put a
  // blank name on a list of who can read a medical record.
  it("ignores a source with no therapist", () => {
    expect(
      clinicalAccessHolders([{ therapistId: "", slotTime: "2026-01-01T00:00:00Z" }], standing())
    ).toEqual([]);
  });
});

describe("describeAccessReason", () => {
  it("names sessions, a lock, or both", () => {
    const base = { therapistId: "t1", lastSessionAt: null, active: true };
    expect(
      describeAccessReason({ ...base, sessionCount: 1, viaProgrammeLock: false })
    ).toBe("1 session with them");
    expect(
      describeAccessReason({ ...base, sessionCount: 4, viaProgrammeLock: false })
    ).toBe("4 sessions with them");
    expect(
      describeAccessReason({ ...base, sessionCount: 0, viaProgrammeLock: true })
    ).toBe("a programme locked to them");
    expect(
      describeAccessReason({ ...base, sessionCount: 2, viaProgrammeLock: true })
    ).toBe("2 sessions with them and a programme locked to them");
  });

  // A sentence that could read "can see this record because of" and then
  // stop is worse than one naming the absence.
  it("never returns an empty reason", () => {
    expect(
      describeAccessReason({
        therapistId: "t1",
        sessionCount: 0,
        lastSessionAt: null,
        viaProgrammeLock: false,
        active: true,
      })
    ).toBe("No current reason on record");
  });
});

describe("what grants clinical access", () => {
  it("is a live or delivered session, never a cancelled one", () => {
    expect(appointmentGrantsClinicalAccess("requested")).toBe(true);
    expect(appointmentGrantsClinicalAccess("confirmed")).toBe(true);
    expect(appointmentGrantsClinicalAccess("completed")).toBe(true);
    expect(appointmentGrantsClinicalAccess("cancelled")).toBe(false);
    expect(appointmentGrantsClinicalAccess(null)).toBe(false);
  });

  it("is a programme lock only while the programme is paid, active and unexpired", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    const live = { payment_status: "paid", status: "active", expires_at: "2026-12-01T00:00:00Z" };
    expect(programmeLockGrantsClinicalAccess(live, now)).toBe(true);
    expect(programmeLockGrantsClinicalAccess({ ...live, expires_at: null }, now)).toBe(true);
    expect(programmeLockGrantsClinicalAccess({ ...live, payment_status: "unpaid" }, now)).toBe(false);
    expect(programmeLockGrantsClinicalAccess({ ...live, status: "refunded" }, now)).toBe(false);
    expect(programmeLockGrantsClinicalAccess({ ...live, expires_at: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });
});
