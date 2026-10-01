import { describe, it, expect } from "vitest";
import {
  TEMP_PASSWORD_VISIBLE_MS,
  readableTempPassword,
} from "./tempPassword";

const NOW = new Date("2026-06-01T12:00:00Z").getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("readableTempPassword", () => {
  it("shows a credential issued recently", () => {
    expect(
      readableTempPassword({ temp_password: "abc123", temp_password_set_at: iso(1000) }, NOW)
    ).toEqual({ password: "abc123", expired: false });
  });

  it("stops showing one past the window", () => {
    expect(
      readableTempPassword(
        { temp_password: "abc123", temp_password_set_at: iso(TEMP_PASSWORD_VISIBLE_MS + 1000) },
        NOW
      )
    ).toEqual({ password: null, expired: true });
  });

  it("still shows one exactly at the boundary", () => {
    // Refusing at the boundary would show less than the window promises.
    expect(
      readableTempPassword(
        { temp_password: "abc123", temp_password_set_at: iso(TEMP_PASSWORD_VISIBLE_MS) },
        NOW
      ).password
    ).toBe("abc123");
  });

  it("reports nothing-to-show and expired as different things", () => {
    // An account that set its own password had the value cleared; one whose
    // issued credential aged out has a different next step for the admin.
    expect(readableTempPassword({ temp_password: null }, NOW)).toEqual({
      password: null,
      expired: false,
    });
  });

  it("treats an undated credential as expired, not as fresh", () => {
    // Written before the timestamp column existed, so it could be
    // arbitrarily old. The safe reading of "I don't know when" is not "show".
    expect(
      readableTempPassword({ temp_password: "abc123", temp_password_set_at: null }, NOW)
    ).toEqual({ password: null, expired: true });
  });

  it("treats an unreadable timestamp as expired", () => {
    expect(
      readableTempPassword({ temp_password: "abc", temp_password_set_at: "not a date" }, NOW)
        .expired
    ).toBe(true);
  });

  it("handles a missing note at all", () => {
    expect(readableTempPassword(null, NOW).password).toBeNull();
    expect(readableTempPassword(undefined, NOW).password).toBeNull();
  });

  it("ignores a blank stored value", () => {
    expect(
      readableTempPassword({ temp_password: "   ", temp_password_set_at: iso(0) }, NOW).password
    ).toBeNull();
  });
});
