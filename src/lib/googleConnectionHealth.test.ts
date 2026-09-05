import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkGoogleConnection,
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
    });
  });

  it("does not call a network failure a dead token", async () => {
    // Telling an owner to re-authorize over a blip wastes their time and
    // teaches them to ignore the panel.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const status = await checkGoogleConnection();

    expect(status).toEqual({ state: "broken", deadToken: false, detail: "fetch failed" });
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
