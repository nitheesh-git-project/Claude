import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PROFILE_CACHE_TTL_SECONDS,
  issueProfileCookie,
  readProfileCookie,
  type CachedProfile,
} from "./proxyProfileCache";

// This cookie is the only thing standing between "the browser says I am an
// admin" and the proxy believing it, so the tests below are mostly about the
// ways it must refuse. Every one of them is a case where returning a profile
// instead of null would let somebody keep or acquire access they should not
// have.

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const ADMIN: CachedProfile = { role: "admin", approved: true, active: true };
const PATIENT: CachedProfile = { role: "patient", approved: true, active: true };

const NOW = 1_700_000_000_000;

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.PROXY_PROFILE_CACHE_SECRET;
  process.env.PROXY_PROFILE_CACHE_SECRET = "test-secret-not-a-real-one";
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.PROXY_PROFILE_CACHE_SECRET;
  else process.env.PROXY_PROFILE_CACHE_SECRET = previousSecret;
});

describe("round trip", () => {
  it("reads back exactly what was written", async () => {
    const cookie = await issueProfileCookie(USER, ADMIN, NOW);
    expect(cookie).not.toBeNull();
    expect(await readProfileCookie(cookie!, USER, NOW)).toEqual(ADMIN);
  });

  it("preserves false flags rather than defaulting them to true", async () => {
    // A suspended, unapproved therapist. If these came back true the proxy
    // would wave through exactly the account it exists to stop.
    const suspended: CachedProfile = {
      role: "therapist",
      approved: false,
      active: false,
    };
    const cookie = await issueProfileCookie(USER, suspended, NOW);
    expect(await readProfileCookie(cookie!, USER, NOW)).toEqual(suspended);
  });
});

describe("refusals", () => {
  it("rejects a cookie signed for a different user", async () => {
    // The replay this prevents: sign in as an admin, keep the cookie, sign
    // in as a patient on the same browser. Without the user id in the signed
    // payload the admin answer would still verify.
    const cookie = await issueProfileCookie(USER, ADMIN, NOW);
    expect(await readProfileCookie(cookie!, OTHER_USER, NOW)).toBeNull();
  });

  it("rejects a cookie whose payload was edited", async () => {
    const cookie = await issueProfileCookie(USER, PATIENT, NOW);
    const forged = cookie!.replace("patient", "admin0");
    expect(forged).not.toEqual(cookie);
    expect(await readProfileCookie(forged, USER, NOW)).toBeNull();
  });

  it("rejects a cookie whose signature was replaced", async () => {
    const cookie = await issueProfileCookie(USER, ADMIN, NOW);
    const payload = cookie!.slice(0, cookie!.lastIndexOf("."));
    expect(await readProfileCookie(`${payload}.not-a-signature`, USER, NOW)).toBeNull();
  });

  it("rejects an unsigned payload", async () => {
    expect(await readProfileCookie(`${USER}|admin|1|1|${NOW + 60_000}`, USER, NOW)).toBeNull();
  });

  it("expires exactly at the TTL, not after it", async () => {
    const cookie = await issueProfileCookie(USER, ADMIN, NOW);
    const ttlMs = PROFILE_CACHE_TTL_SECONDS * 1000;
    expect(await readProfileCookie(cookie!, USER, NOW + ttlMs - 1)).toEqual(ADMIN);
    expect(await readProfileCookie(cookie!, USER, NOW + ttlMs)).toBeNull();
    expect(await readProfileCookie(cookie!, USER, NOW + ttlMs + 1)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await issueProfileCookie(USER, ADMIN, NOW);
    process.env.PROXY_PROFILE_CACHE_SECRET = "a-different-secret";
    expect(await readProfileCookie(cookie!, USER, NOW)).toBeNull();
  });

  it("returns null for absent and malformed values rather than throwing", async () => {
    for (const value of [undefined, "", ".", "no-dot-at-all", "..", `${USER}.`]) {
      expect(await readProfileCookie(value as string | undefined, USER, NOW)).toBeNull();
    }
  });
});

describe("without a configured secret", () => {
  // The degradation posture: no secret means no caching, so the proxy falls
  // through to the database read it has always done. Slower, never wrong,
  // and never open.
  it("issues nothing", async () => {
    delete process.env.PROXY_PROFILE_CACHE_SECRET;
    expect(await issueProfileCookie(USER, ADMIN, NOW)).toBeNull();
  });

  it("trusts nothing, including a cookie that was validly signed earlier", async () => {
    const cookie = await issueProfileCookie(USER, ADMIN, NOW);
    delete process.env.PROXY_PROFILE_CACHE_SECRET;
    expect(await readProfileCookie(cookie!, USER, NOW)).toBeNull();
  });
});
