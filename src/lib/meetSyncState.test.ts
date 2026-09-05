import { describe, expect, it } from "vitest";
import { isSessionCalendarSynced, sessionNeedsCalendarSync } from "./meetSyncState";

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
