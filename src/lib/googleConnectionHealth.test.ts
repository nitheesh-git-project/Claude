import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkGoogleConnection,
  describeCredential,
  googleCredentialsUsable,
  resetGoogleConnectionCache,
} from "./googleConnectionHealth";

const ENV = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REFRESH_TOKEN",
] as const;

function setEnv() {
  for (const key of ENV) process.env[key] = "x";
}

// What describeCredential makes of the "x" setEnv writes. Hardcoded rather
// than computed from the module under test, which would assert it against
// itself.
const SHAPE_OF_X = { length: 1, fingerprint: "2d711642", padded: false };
function clearEnv() {
  for (const key of ENV) delete process.env[key];
}

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

const CALENDAR = "https://www.googleapis.com/auth/calendar.events";
const MEET = "https://www.googleapis.com/auth/meetings.space.settings";

beforeEach(() => {
  resetGoogleConnectionCache();
  setEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearEnv();
});

describe("checkGoogleConnection", () => {
  it("reports which variables are missing without calling Google", async () => {
    clearEnv();
    const fetchMock = respond(200, {});
    vi.stubGlobal("fetch", fetchMock);

    const status = await checkGoogleConnection();

    expect(status).toEqual({ state: "not_configured", missing: [...ENV] });
    // A missing credential is answerable locally; spending a network call to
    // learn it would make an unconfigured install pay for the check forever.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names a dead refresh token, which is the one failure with a known fix", async () => {
    vi.stubGlobal(
      "fetch",
      respond(400, { error: "invalid_grant", error_description: "Bad Request" })
    );

    const status = await checkGoogleConnection();

    expect(status).toEqual({
      state: "broken",
      deadToken: true,
      detail: "Bad Request",
      // Reported alongside the refusal, because `invalid_grant` is also what
      // a server still holding the previous token is answered with.
      credential: SHAPE_OF_X,
      clientId: "x",
    });
  });

  it("does not call a network failure a dead token", async () => {
    // Telling an owner to re-authorize over a blip wastes their time and
    // teaches them to ignore the panel.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const status = await checkGoogleConnection();

    expect(status).toEqual({
      state: "broken",
      deadToken: false,
      detail: "fetch failed",
      // A timeout says nothing about the stored value either way, so the
      // shape is still reported: it is the same environment.
      credential: SHAPE_OF_X,
      clientId: "x",
    });
  });

  it("reads the granted scopes off the same round trip", async () => {
    vi.stubGlobal("fetch", respond(200, { access_token: "t", scope: `${CALENDAR} ${MEET}` }));
    await expect(checkGoogleConnection()).resolves.toEqual({
      state: "connected",
      meetScope: true,
    });

    resetGoogleConnectionCache();
    vi.stubGlobal("fetch", respond(200, { access_token: "t", scope: CALENDAR }));
    await expect(checkGoogleConnection()).resolves.toEqual({
      state: "connected",
      meetScope: false,
    });
  });

  it("memoizes a success so a click-around of the back office pays once", async () => {
    const fetchMock = respond(200, { access_token: "t", scope: CALENDAR });
    vi.stubGlobal("fetch", fetchMock);

    await checkGoogleConnection();
    await checkGoogleConnection();
    await checkGoogleConnection();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-checks a failure sooner than a success", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = respond(400, { error: "invalid_grant" });
      vi.stubGlobal("fetch", fetchMock);

      await checkGoogleConnection();
      // Inside the short failure window: still cached.
      vi.advanceTimersByTime(30_000);
      await checkGoogleConnection();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Past it: an owner who has just re-run the token script must not have
      // to wait out a long cache to see the panel go green.
      vi.advanceTimersByTime(31_000);
      await checkGoogleConnection();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("googleCredentialsUsable", () => {
  it("is false while the credential is down, so the sweep spends no attempts", async () => {
    vi.stubGlobal("fetch", respond(400, { error: "invalid_grant" }));
    await expect(googleCredentialsUsable()).resolves.toBe(false);
  });

  it("is false when Google was never configured", async () => {
    clearEnv();
    await expect(googleCredentialsUsable()).resolves.toBe(false);
  });

  it("is true when the token is accepted", async () => {
    vi.stubGlobal("fetch", respond(200, { access_token: "t", scope: CALENDAR }));
    await expect(googleCredentialsUsable()).resolves.toBe(true);
  });
});

// Three facts that let an owner tell "the permission died" from "this server
// never received the value I saved" -- two causes Google reports with the
// identical `invalid_grant`, and only one of which the card's steps fix.
describe("describeCredential", () => {
  it("says nothing at all when the value is absent", () => {
    expect(describeCredential(undefined)).toBeNull();
    expect(describeCredential(null)).toBeNull();
    // An empty string is an unset variable as far as an owner is concerned,
    // and "0 characters, fingerprint e3b0c442" would read as a value that
    // exists.
    expect(describeCredential("")).toBeNull();
  });

  it("reports the length of the raw value", () => {
    expect(describeCredential("1//abcdef")?.length).toBe(9);
  });

  it("fingerprints the same value the same way, every time", () => {
    const a = describeCredential("1//04-a-real-looking-token");
    const b = describeCredential("1//04-a-real-looking-token");
    expect(a?.fingerprint).toBe(b?.fingerprint);
    expect(a?.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("fingerprints two different values differently", () => {
    expect(describeCredential("token-one")?.fingerprint).not.toBe(
      describeCredential("token-two")?.fingerprint
    );
  });

  it("reveals none of the value", () => {
    const secret = "1//04mxqzxdkHnStCgYIARAAGAQSNwF";
    const shape = describeCredential(secret);
    expect(secret).not.toContain(shape!.fingerprint);
    expect(shape!.fingerprint).not.toContain(secret.slice(0, 4));
  });

  it("hashes the raw value, not a trimmed one", () => {
    // Trimming first would print one fingerprint for two values Google
    // treats differently, which is the exact confusion this exists to end.
    expect(describeCredential("token")?.fingerprint).not.toBe(
      describeCredential("token\n")?.fingerprint
    );
  });

  it("flags whitespace around the value, which needs nothing to compare against", () => {
    expect(describeCredential("token")?.padded).toBe(false);
    expect(describeCredential("token\n")?.padded).toBe(true);
    expect(describeCredential(" token")?.padded).toBe(true);
    // Whitespace *inside* is not padding, and a real token has none --
    // flagging it would put a wrong finding on the card.
    expect(describeCredential("to ken")?.padded).toBe(false);
  });
});
