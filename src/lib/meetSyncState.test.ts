import { describe, expect, it } from "vitest";
import {
  calendarSyncNeedsPerson,
  describeCalendarSync,
  describeCalendarSyncLabel,
  isSessionCalendarSynced,
  sessionNeedsCalendarSync,
  type CalendarSyncState,
} from "./meetSyncState";

describe("isSessionCalendarSynced", () => {
  it("judges a home visit by its event, never by a Meet link it never gets", () => {
    // The bug: a home visit passes withMeet:false, so meet_link is null for
    // its whole life. Reading that as "sync failed" listed every confirmed
    // home visit in Sync Health for ever.
    expect(
      isSessionCalendarSynced({
        visit_mode: "home_visit",
        meet_link: null,
        google_event_id: "evt_1",
      })
    ).toBe(true);
  });

  it("still reports a home visit whose event was never created", () => {
    expect(
      isSessionCalendarSynced({
        visit_mode: "home_visit",
        meet_link: null,
        google_event_id: null,
      })
    ).toBe(false);
  });

  it("judges an online session by its Meet link", () => {
    expect(
      isSessionCalendarSynced({ visit_mode: "online", meet_link: "https://meet.google.com/abc-defg-hij" })
    ).toBe(true);
    expect(isSessionCalendarSynced({ visit_mode: "online", meet_link: null })).toBe(false);
  });

  it("does not accept an online event as synced just because the event exists", () => {
    // An online event with no conferencing on it is a real failure -- the
    // patient has an invite with nothing to join.
    expect(
      isSessionCalendarSynced({
        visit_mode: "online",
        meet_link: null,
        google_event_id: "evt_1",
      })
    ).toBe(false);
  });

  it("falls back to the Meet link when visit_mode was not loaded", () => {
    // The isolated query that supplies visit_mode can fail on a database the
    // migration has not reached; the old behaviour is the safe fallback.
    expect(isSessionCalendarSynced({ meet_link: "https://meet.google.com/abc-defg-hij" })).toBe(true);
    expect(isSessionCalendarSynced({ meet_link: null })).toBe(false);
  });

  it("does not accuse a home visit whose google_event_id was not loaded", () => {
    // undefined is "column absent", not "empty". Guessing empty here would
    // put the false positives straight back -- and a false "needs attention"
    // is the one that gets clicked, which is what minted the duplicates.
    expect(isSessionCalendarSynced({ visit_mode: "home_visit", meet_link: null })).toBe(true);
  });

  it("sessionNeedsCalendarSync is the exact inverse", () => {
    for (const row of [
      { visit_mode: "home_visit", meet_link: null, google_event_id: "e" },
      { visit_mode: "home_visit", meet_link: null, google_event_id: null },
      { visit_mode: "online", meet_link: "m" },
      { visit_mode: "online", meet_link: null },
      { meet_link: null },
    ]) {
      expect(sessionNeedsCalendarSync(row)).toBe(!isSessionCalendarSynced(row));
    }
  });
});

describe("describeCalendarSync", () => {
  const opts = { maxAttempts: 5, claimStaleMs: 60_000, nowMs: 1_700_000_000_000 };
  const unsyncedOnline = {
    visit_mode: "online",
    meet_link: null,
    google_event_id: null,
  };

  it("says synced when the mode's own artefact is there", () => {
    expect(
      describeCalendarSync(
        { visit_mode: "online", meet_link: "https://meet.google.com/a-b-c" },
        opts
      )
    ).toBe("synced");
    // A home visit is judged on the event, never the link it never gets.
    expect(
      describeCalendarSync(
        { visit_mode: "home_visit", meet_link: null, google_event_id: "evt_1" },
        opts
      )
    ).toBe("synced");
  });

  it("says unknown rather than accusing a row whose error column was not loaded", () => {
    expect(describeCalendarSync(unsyncedOnline, opts)).toBe("unknown");
  });

  it("says trying now while a claim is fresh", () => {
    expect(
      describeCalendarSync(
        {
          ...unsyncedOnline,
          google_calendar_sync_error: null,
          google_calendar_sync_claimed_at: new Date(opts.nowMs - 5_000).toISOString(),
        },
        opts
      )
    ).toBe("in_flight");
  });

  it("ignores a claim older than the staleness window", () => {
    // A render that died holding the row is not an attempt still running --
    // the sweep's own rule, so the word and the sweep cannot disagree.
    expect(
      describeCalendarSync(
        {
          ...unsyncedOnline,
          google_calendar_sync_error: "boom",
          google_calendar_sync_claimed_at: new Date(opts.nowMs - 120_000).toISOString(),
        },
        opts
      )
    ).toBe("retrying");
  });

  it("separates the sweep having given up from it still trying", () => {
    expect(
      describeCalendarSync(
        { ...unsyncedOnline, google_calendar_sync_error: "boom", google_calendar_sync_attempts: 5 },
        opts
      )
    ).toBe("needs_person");
    expect(
      describeCalendarSync(
        { ...unsyncedOnline, google_calendar_sync_error: "boom", google_calendar_sync_attempts: 2 },
        opts
      )
    ).toBe("retrying");
  });

  it("says waiting for a row nothing has tried yet", () => {
    expect(
      describeCalendarSync(
        { ...unsyncedOnline, google_calendar_sync_error: null, google_calendar_sync_attempts: 0 },
        opts
      )
    ).toBe("waiting");
  });

  it("asks for a person on exactly one state", () => {
    const states: CalendarSyncState[] = [
      "synced",
      "in_flight",
      "retrying",
      "needs_person",
      "waiting",
      "unknown",
    ];
    expect(states.filter(calendarSyncNeedsPerson)).toEqual(["needs_person"]);
    // Every state says something; none falls through to an empty string.
    for (const s of states) expect(describeCalendarSyncLabel(s).length).toBeGreaterThan(0);
  });
});
