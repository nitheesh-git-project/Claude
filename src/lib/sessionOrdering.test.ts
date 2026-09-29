import { describe, it, expect } from "vitest";
import {
  compareSessionsNewestFirst,
  sortSessionsNewestFirst,
} from "./sessionOrdering";

type Row = {
  id: string;
  slot_time?: string | null;
  created_at?: string | null;
};

const ids = (rows: Row[]) => sortSessionsNewestFirst(rows).map((r) => r.id);

describe("sortSessionsNewestFirst", () => {
  it("orders by the session's own date and time, newest first", () => {
    expect(
      ids([
        { id: "past", slot_time: "2026-09-02T09:00:00Z" },
        { id: "future", slot_time: "2026-10-12T18:00:00Z" },
        { id: "today", slot_time: "2026-09-28T16:00:00Z" },
      ])
    ).toEqual(["future", "today", "past"]);
  });

  it("ignores the order the rows arrived in", () => {
    // The regression this module exists for: `created_at` descending is also
    // session-code order, and it disagrees with the slot order the moment a
    // session is rescheduled.
    expect(
      ids([
        { id: "booked-first", slot_time: "2026-11-01T10:00:00Z", created_at: "2026-01-01T00:00:00Z" },
        { id: "booked-second", slot_time: "2026-10-01T10:00:00Z", created_at: "2026-02-01T00:00:00Z" },
      ])
    ).toEqual(["booked-first", "booked-second"]);
  });

  it("puts a session with no date last, whichever side it starts on", () => {
    expect(
      ids([
        { id: "undated", slot_time: null },
        { id: "dated", slot_time: "2026-09-02T09:00:00Z" },
      ])
    ).toEqual(["dated", "undated"]);
    expect(
      ids([
        { id: "dated", slot_time: "2026-09-02T09:00:00Z" },
        { id: "undated", slot_time: null },
      ])
    ).toEqual(["dated", "undated"]);
  });

  it("puts every undated session after every dated one", () => {
    expect(
      ids([
        { id: "u1", slot_time: null, created_at: "2026-03-01T00:00:00Z" },
        { id: "d1", slot_time: "2026-05-01T10:00:00Z" },
        { id: "u2", slot_time: undefined, created_at: "2026-04-01T00:00:00Z" },
        { id: "d2", slot_time: "2026-06-01T10:00:00Z" },
      ])
    ).toEqual(["d2", "d1", "u2", "u1"]);
  });

  it("breaks a tie on created_at, newest first", () => {
    expect(
      ids([
        { id: "older", slot_time: "2026-10-01T10:00:00Z", created_at: "2026-01-01T00:00:00Z" },
        { id: "newer", slot_time: "2026-10-01T10:00:00Z", created_at: "2026-02-01T00:00:00Z" },
      ])
    ).toEqual(["newer", "older"]);
  });

  it("treats an unreadable date as an absent one rather than returning NaN", () => {
    expect(
      compareSessionsNewestFirst(
        { slot_time: "not a date" },
        { slot_time: "2026-10-01T10:00:00Z" }
      )
    ).toBe(1);
    expect(
      Number.isNaN(
        compareSessionsNewestFirst({ slot_time: "nope" }, { slot_time: "also nope" })
      )
    ).toBe(false);
  });

  it("is a total order over rows carrying nothing at all", () => {
    expect(compareSessionsNewestFirst({}, {})).toBe(0);
    expect(ids([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
  });

  it("never mutates the array it was given", () => {
    const rows: Row[] = [
      { id: "past", slot_time: "2026-09-02T09:00:00Z" },
      { id: "future", slot_time: "2026-10-12T18:00:00Z" },
    ];
    sortSessionsNewestFirst(rows);
    expect(rows.map((r) => r.id)).toEqual(["past", "future"]);
  });
});
